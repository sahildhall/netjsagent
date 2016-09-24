/**
 * Created by bala on 23/7/15.
 */

var agentConfReader = require("./agent-setting");
var flowpathHandler = require("./flowpath-handler");
var methodManager = require("./methodManager.js");
var dataConnectionHandler = require("./dataconnection-handler");
var AutoSensorConnectionHandler = require('./autoSensorConnection-handler');
var ndMetaDataRecoveryProcess = require('./metaData/ndMetaDataRecoveryProcess');
var eventLoopMonitor = require('./event_loop_moitor/ndEventLoopMonitor.js');
var heapGcMonitor = require('./heap_gc_monitor/ndHeapGCMonitor.js')
var ndBTMonitor = require('./BT/ndBTMonitor.js')
var ndBackendMonitor = require('./backend/ndBackendMonitor.js')
var ndMethodMetaData =  require('./metaData/ndMethodMetaData');
var ndBTMetaData = require('./metaData/ndBTMetaData');
var ndSQLMetaData = require('./metaData/ndSQLMetaData');
var v8_profiler = require('./v8-profiler');
var v8 = require('v8-profiler');
var path = require('path');
var util = require('./util');
var Long = require('long');
var fs = require('fs');
var dataConnection;
var autoSensorConnection;
var status ;
var isHeapDumpInProgress = false;
var lastHeapdumpReqTime = "";
var heapDumpCount = 0;

function MessageHandler(clientSocket)
{
    this.clientSocket = clientSocket;
    this.handleMessages();
}

MessageHandler.prototype.sendIntialMessages = function() {
    var processId = process.pid;

    var controlMessage = "nd_ctrl_msg_req:appName=" + agentConfReader.getInstance() + ";ndAppServerHost="
        + agentConfReader.getServerName() + ";tierName=" + agentConfReader.getTierName() + ";bciVersion=VERSION 4.1.2.Local BUILD 18"
        + ";bciStartTime=" + agentConfReader.getBCIStartUpTime() + ";ndHome=/opt/cavisson/netdaignostic;pid=" + processId + "\n";


    util.logger.info(agentConfReader.currentTestRun+" | Message send to ndc : "+controlMessage);
    this.clientSocket.write(controlMessage);

}

MessageHandler.prototype.handleMessages = function() {
    var clientSocket = this.clientSocket;

    clientSocket.on("data", function (data) {

        try {
            util.logger.info(agentConfReader.currentTestRun+" | Control message received from ndc:" + data.toString());
            console.log("control message received from ndc:" + data.toString());

            var dataArray = data.toString().split(":");
            //var clientMsg = "nd_meta_data_req:action=get_heap_dump;File=/home/netstorm/Controller_bibhu/ndDump.log;live=1;Tier=NodeJS;Server=Mew;Instance=Mew;";
            var clientMsg = data.toString();

            if (dataArray[0] == "nd_ctrl_msg_rep") {

                var messageArray = dataArray[1].toString().split(";");
            }

            /*
             For CPU Profiling
             */

            if (dataArray[0] == "nd_meta_data_req") {       // dataArray[0] == "nd_meta_data_req") {

                var messageArray = dataArray[1].split(";");

                var action = messageArray[0].split("=");

                //For metaData recovery, now we are sending some dummy value, in future we will make this response with original value

                if (clientMsg.trim().startsWith("nd_meta_data_req:action=send_meta_data;")) {
                    ndMetaDataRecoveryProcess.processClientMessage(clientMsg, clientSocket);
                    clientSocket.write("nd_meta_data_rep:status=complete;\n");
                }

                if (clientMsg.trim().startsWith("nd_meta_data_req:action=get_thread_dump;")) {

                    //This message needs BCIAgent to take threaddump
                    //log the cline message
                    //start the threaddump processor
                    //send the completion response
                    //if error send the response

                    var compressMode = false;

                    if (dataArray.indexOf(";CompressMode=1;") != -1)
                        compressMode = true;

                    try{
                        util.logger.info(agentConfReader.currentTestRun+" | Invoking CPU Profiling request for 10 min .");
                        v8_profiler.startCpuProfiling(clientSocket);
                    }
                    catch(err){
                        clientSocket.write("nd_meta_data_rep:action=get_thread_dump;result=Error:<Unable to take cpuProfiling , please check NodeAgent logs>;\n");
                        util.logger.warn(agentConfReader.currentTestRun + " | Unable to take cpu_profiling : "+err);
                    }
                }

                else if (clientMsg.trim().startsWith("nd_meta_data_req:action=get_heap_dump;")) {
                    try {
                        util.logger.info(agentConfReader.currentTestRun+" | Invoking for Heap Dump .");
                        MessageHandler.handleClientMessageForTakingHeapDump(clientMsg, clientSocket);
                    }
                    catch (e) {
                        clientSocket.write("nd_meta_data_rep:action=get_heap_dump;result=Error:<Unable to take heapDump Because Of Exception.Check BCI error log for detail.>;\n");
                        util.logger.warn(agentConfReader.currentTestRun + " | Unable to take heapDump : "+e);
                    }

                }
            }

            if (dataArray[0] == "nd_control_req") {
                var messageArray = dataArray[1].split(";");

                var action = messageArray[0].split("=");

                if (action[1] == "start_instrumentation") {

                    agentConfReader.isToInstrument = true;
                    agentConfReader.isTestRunning = true;
                    var currTestId;

                    util.logger.info(agentConfReader.currentTestRun+" | isToInstrument : "+agentConfReader.isToInstrument);
                    util.logger.info(agentConfReader.currentTestRun+" | isTestRunning : "+agentConfReader.isTestRunning);

                    try
                    {
                        for (var i = 0; i < messageArray.length; i++)
                        {

                            var propertyValuePairs = messageArray[i].split("=");

                            if(propertyValuePairs[0] == "testIdx") {
                                currTestId = propertyValuePairs[1]
                                util.logger.info(currTestId+" | New test run started .");
                            }

                            if(propertyValuePairs[0] == "cavEpochDiff") {
                                agentConfReader.cavEpochDiff = propertyValuePairs[1];
                                util.logger.info(currTestId+" | cavEpochDiff is  : "+agentConfReader.cavEpochDiff );
                            }

                            if(propertyValuePairs[0] == "bciInstrSessionPct") {
                                agentConfReader.bciInstrSessionPct = propertyValuePairs[1];
                                util.logger.info(currTestId+" | bciInstrSessionPct is  : "+agentConfReader.bciInstrSessionPct );
                            }

                            if (propertyValuePairs[0] == "ndFlowpathMasks") {
                                FP_Instances = propertyValuePairs[1].split("%20");
                                var instance_id_fromNDC = (FP_Instances[0]);
                                if (instance_id_fromNDC.length > 8) {
                                    var making_id = instance_id_fromNDC.split("x");
                                    var msb = '0x' + making_id[1].substring(0, making_id[1].length / 2);
                                    var lsb = '0x' + making_id[1].substring(making_id[1].length / 2, making_id[1].length);
                                    agentConfReader.flowPathInstanceInitialID = new Long(lsb, msb).toString();
                                }
                                agentConfReader.timeStampMask = parseInt((FP_Instances[1]), 16);
                                agentConfReader.seqNoDigits = parseInt((FP_Instances[2]), 16);
                                agentConfReader.seqNumMask = parseInt((FP_Instances[3]), 16);
                            }
                            var property = propertyValuePairs[0];
                            var value = propertyValuePairs[1];

                            agentConfReader[property] = value;

                        }

                        /*
                         if Test run is changed then reseting all the maps and generating FP_Mask again
                         */
                        if(agentConfReader.currentTestRun != currTestId) {
                            util.logger.info(currTestId+" | Cleaning all maps");
                            ndBTMetaData.clear();
                            ndSQLMetaData.clear();
                            ndMethodMetaData.clear();
                            methodManager.clearMap();

                            agentConfReader.generateFPMask();

                            agentConfReader.backendRecordMap = new Object();
                            agentConfReader.backendMetaMap = new Object();
                            agentConfReader.flowMap = new Object();
                            agentConfReader.backendID = 0;
                            agentConfReader.seqId = 0;
                        }

                        //setting Test Run id comming from ndc as a current test run id
                        agentConfReader.currentTestRun = currTestId;

                        //dataConnection = new dataConnectionHandler.createDataConn();
                        agentConfReader.dataConnHandler = new dataConnectionHandler();
                        agentConfReader.dataConnHandler.createDataConn();

                        agentConfReader.autoSensorConnHandler = new AutoSensorConnectionHandler();
                        agentConfReader.autoSensorConnHandler.createAutoSensorConn();

                        if(agentConfReader.dataConnHandler && agentConfReader.autoSensorConnHandler) {
                            if (1 == agentConfReader.enable_eventLoop_monitor) {                    //Starting the event loop manager
                                util.logger.info(agentConfReader.currentTestRun + " | Initializing event_loop_monitor .");
                                eventLoopMonitor.init();
                            }

                            if (1 == agentConfReader.enable_garbage_profiler) {                    //Starting the event loop manager
                                util.logger.info(agentConfReader.currentTestRun + " | Initialized heap_gc_monitor .");
                                heapGcMonitor.init();
                            }

                            ndBTMonitor.init();
                            ndBackendMonitor.init();
                        }
                    }
                    catch (err) {
                        util.logger.warn(agentConfReader.currentTestRun+" | "+err);
                    }
                }


                //Control message for closing the connection
                else if (action[1] == "stop_instrumentation") {
                    status = messageArray[1].split("=")[1];

                    util.logger.info(agentConfReader.currentTestRun+" | stop_instrumentation message from ndc ")

                    if (status == "stopping") {
                        if (agentConfReader.dataConnHandler && agentConfReader.autoSensorConnHandler) {

                            MessageHandler.dumpMethodLastRecord(10,agentConfReader.dataConnHandler);

                            agentConfReader.isToInstrument = false;
                            agentConfReader.isTestRunning = false;
                            agentConfReader.currentTestRun = 0 ;

                            //creating control message
                            controlMessage = "nd_control_rep:action=stop_instrumentation;status=" + status + ";result=Ok;" + "\n";

                            util.logger.info(agentConfReader.currentTestRun+" | Destroying the Data and AutoSensor connection . ")
                            agentConfReader.dataConnHandler.closeConnection();
                            delete agentConfReader.dataConnHandler;

                            agentConfReader.autoSensorConnHandler.closeConnection();
                            delete agentConfReader.autoSensorConnHandler;

                            util.logger.info(agentConfReader.currentTestRun+" | Clearing all maps ");
                            //clean all maps

                            heapGcMonitor.stopHeapGC();
                            eventLoopMonitor.stopEvnetloopMonitor();
                            ndBTMonitor.stopBTMonitor();
                            ndBackendMonitor.stopBTMonitor();

                            util.logger.info(agentConfReader.currentTestRun+" | " + controlMessage);
                            clientSocket.write(controlMessage);               //Stopping the connection
                        }
                    }
                }
            }
        }
        catch(err){util.logger.warn(err)}
    })
};

MessageHandler.dumpMethodLastRecord = function(num,dataSocket){
    var tenRecord = num + "," + '\n';
    try
    {
        util.logger.info(agentConfReader.currentTestRun+ " | DumpMethodLastRecord "+tenRecord);
        dataSocket.write(tenRecord);
    }
    catch(e)
    {
        util.logger.warn(agentConfReader.currentTestRun+ " | DumpMethodLastRecord", "Error in dumping 10 record.", e);
    }
}

MessageHandler.handleClientMessageForTakingHeapDump = function(clientMsg,clientSocket) {
    var respMessage = "";
    if(isHeapDumpInProgress )
    {
        try{ //log a message and return from here
            //send error message to ndc and return
            respMessage = "nd_meta_data_rep:action=get_heap_dump;result=Error:<Unable to take heapDump Because Of BCI is already busy for previous request. previous request time :"+ lastHeapdumpReqTime +".>;\n" ;
            clientSocket.write(respMessage);

            return;
        }catch(err){util.logger.warn(agentConfReader.currentTestRun+" | nd_meta_data_rep:action=get_heap_dump;result=Error:<Unable to take heapDump Because Of BCI is already busy for previous request. previous request time :"+ lastHeapdumpReqTime +".>;\n"+err )}

    }

    //Save the requested time for next time logging in case
    lastHeapdumpReqTime = new Date().toString();

    //validate and start heapdump taking
    var isSuccess = MessageHandler.findParametersAndValidate(clientMsg,clientSocket);

};

MessageHandler.findParametersAndValidate = function(clientMsg,clientSocket){
    var allFields = clientMsg.split(";");
    var respMessage = "";
    var fileName;
    var fileParentDir;
    var isOnlyLive = true;
    var heapDirExists =false;
    try {
        for (var i in allFields) {

            //Collect file path and validate if parent dir is present or not ??
            if (-1 != allFields[i].indexOf("File=")) {

                var file_path = allFields[i].split("=")[1].toString();
                if (-1 != file_path.indexOf('.'))
                    file_path = file_path.split('.')[0] + '.heapsnapshot';
                else
                    file_path = file_path + '.heapsnapshot';

                util.logger.info(agentConfReader.currentTestRun+" | File path for Heap Dump is : "+file_path);

                fileParentDir = file_path.substring(0, file_path.lastIndexOf(path.sep));

                if (fs.existsSync(fileParentDir)) {
                    heapDirExists = true;
                }

                //file name -> preety_heap_dump.txt
                fileName = file_path.substring(file_path.lastIndexOf(path.sep) + 1, file_path.length);

            }
            else if (-1 != allFields.indexOf("live")) {
                if (val == "1")
                    isOnlyLive = true;
                else
                    isOnlyLive = false;
            }
        }
    }catch(err){util.logger.warn(agentConfReader.currentTestRun+" | Invalid path for Heap dump file ."+err)}

    try {
        if (!fs.existsSync(file_path)) {
            if (heapDirExists ) {
                isHeapDumpInProgress = true;
                v8_profiler.takeHeapSnapShot(file_path, clientSocket);
                isHeapDumpInProgress = false;
            }
            else{
                clientSocket.write("nd_meta_data_rep:action=get_heap_dump;result=Error:<Unable to take heapDump Because heap directory not exist>;\n");
                util.logger.warn(agentConfReader.currentTestRun+" |  Unable to take heapDump Because heap directory not exist")
            }
        }
    }
    catch (e) {
        clientSocket.write("nd_meta_data_rep:action=get_heap_dump;result=Error:<Unable to take heapDump, please check in agent logs>;\n");
        util.logger.warn(agentConfReader.currentTestRun+" |  Unable to take heapDump " + e);
    }

    return true;
};


module.exports = MessageHandler;