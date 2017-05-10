/**
 * Created by bala on 10/7/15.
 */

var njstrace = require('./lib/njstrace/njsTrace');
var agentSetting = require("./lib/agent-setting");
var clientConn = require("./lib/client");
var path = require('path');
var util = require('./lib/util');
var cluster = require('cluster'),
    instrumentationFile;
NJSInstrument.prototype.instrument = function instrument(args)
{
    try
    {
        if(args){
            if(!args.logLevel)
                args.logLevel = 'debug';
            if(!args.BCILoggingMode)
                args.BCILoggingMode = 'FILE'
        }
        else{
            args = {logLevel : 'debug',BCILoggingMode:'FILE'}
        }

        if(cluster.isMaster)
            util.initializeLogger(args.logLevel,args.BCILoggingMode)
        else
            util.initializeLogger(args.logLevel,args.BCILoggingMode);

        agentSetting.initAllMap(args);
        agentSetting.readSettingFile();             //reading ndsetting file to connect with NS

        /*
         In cluster mode, Instance filed will be generated by agent only in EXCLUSIVE mode in Shared mode, auto scale feature will be
         used to generate instance by NDC
         This check will work only in those case, if auto scaling is not working in instance is sunning in cluster
         mode, then we will provide "EXCLUSIVE" mode in ndsetting.conf .
         */
        /*if(agentSetting.instance)                         //This code is commenting because now we have autoscaling feature .
            agentSetting.isCluster();*/

        //njstrace.inject(null,instrumentationFile);
        //njstrace.inject(null,agentSetting.instrumentationMap);
        //agentSetting.parseInstrProfile(data)
        try {
            instrumentationFile = require('./../../nodeInstr.json');            //Getting Instrumentation profile from server side
        }catch(err){util.logger.warn("No instrumentation profile present ")}

        var instPrfParseobj = require('./lib/utils/instrumentationProfleParser');
        if(instrumentationFile)
            instPrfParseobj.parseInstrFile(instrumentationFile)                 //parsing Instrumentation profile

        njstrace.inject(null,instPrfParseobj.getInstrMap());                    //injecting our code into applications code

        agentSetting.generateFPMask();

        require('./lib/nodetime/index').profile();

        process.nextTick(function(){
            try {
                if(agentSetting.clusterMode) {
                    if (cluster.isMaster)
                        return;
                }
                clientConn.connectToServer();
            }
            catch(e){
                util.logger.warn(e);
            }
        },1000);

    }
    catch(err){
        console.log(err);
    }
};

function NJSInstrument()
{

}

module.exports = new NJSInstrument();
