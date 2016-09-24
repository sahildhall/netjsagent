/**
 * Created by bala on 10/7/15.
 */
var net = require('net');
var MessageHandler = require('./controlmessage-handler');
var agentSetting = require("./agent-setting");
var util = require('./util');

var clientConn;
var retrying=false;
var socket_timeout;
var client ;
var controlMessageHandler;

function clientConn()
{

}

clientConn.connectToServer = function(){

    try {
        clientConn = this;

        client = new net.Socket();

        client.on('error', function(err) {
//                util.logger.error(agentSetting.currentTestRun+" | Control connection, Received error event with retrying : "+retrying+", - " + err);
              });

        client.on('end', function(err) {
//                util.logger.error(agentSetting.currentTestRun+" | Control connection, Received end event with retrying : "+retrying+", on socket-  " + err);
        });

        client.on('close', function(err) {
            try {
                connectToServer();
                util.logger.error(agentSetting.currentTestRun+" | Control connection, Received socket close event with retrying : "+retrying+", - " + err);
            }
            catch(err){util.logger.warn(agentSetting.currentTestRun+" | Error in retrying for control connection ." + err);}
        });

        client.on('connect', function() {
            try {
                clearTimeout(socket_timeout);

                if(!controlMessageHandler) {
                    controlMessageHandler = new MessageHandler(this);
                }
                util.logger.info(agentSetting.currentTestRun+" | Connection established with NDCollector : Socket[addr="+agentSetting.getNDCHost()+",port="+agentSetting.getPort() + ",localport" +this.localPort );
                controlMessageHandler.sendIntialMessages();
            }
            catch(err){util.logger.warn(agentSetting.currentTestRun+" | error" + err);}
        });

        clientConn._connect();
    }
    catch(err){util.logger.warn("error" + err);}
};


function connectToServer()
{
    if(client.writable)
        return;

    if(socket_timeout)
        return;

    agentSetting.checkNDSettingFile(agentSetting.ndSettingFile);

    socket_timeout = setTimeout(function () {
        try {
            clientConn._connect();
            socket_timeout=0;
            util.logger.warn(agentSetting.currentTestRun+" | Timer for retrying control connectoion expired. trying to connect...")
        }
        catch(err){util.logger.warn(agentSetting.currentTestRun+" | Error in retrying" + err);}
    }, 60000);
}


clientConn._connect = function()
{
    try{
        client.connect(agentSetting.getPort(), agentSetting.getNDCHost())
    }
    catch(err){util.logger.warn(agentSetting.currentTestRun+" | Error in making connection" + err);}

};


module.exports = clientConn;
