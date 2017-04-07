/**
 * Created by bala on 10/7/15.
 */

var ndEventLoopMonitor = require('./lib/event_loop_moitor/ndEventLoopMonitor.js');
var ndHeapGCMonitor = require('./lib/heap_gc_monitor/ndHeapGCMonitor.js');
var njstrace = require('./lib/njstrace/njsTrace');
var agentSetting = require("./lib/agent-setting");
var clientConn = require("./lib/client");
var path = require('path');
var util = require('./lib/util');
var instPrfParseobj = require('./lib/instrProfileParser');
var fs = require('fs');
var cluster = require('cluster');
var instrumentationFile = path.join(path.resolve(__dirname),'/../../nodeInstr.json');
//var instrumentationFile = path.join(path.resolve(__dirname),'/../../instrumentation.conf');
NJSInstrument.prototype.instrument = function instrument(args)
{
    try
    {
        if(!args.logLevel && !args.BCILoggingMode)
            args = {logLevel : 'debug',BCILoggingMode : 'false'}

        if(cluster.isMaster)
            util.initializeLogger(args.logLevel,args.BCILoggingMode)
        else
            util.initializeLogger(args.logLevel,args.BCILoggingMode);



        agentSetting.initAllMap();

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
        var data ;
        if(fs.existsSync(instrumentationFile)) {
            util.logger.info(agentSetting.currentTestRun+" | Instrumentation file exists : "+instrumentationFile)
            data = fs.readFileSync(instrumentationFile)
        }

        if(data)
            instPrfParseobj.parseInstrProfile(data)

        njstrace.inject(null,instPrfParseobj.getInstrMap());

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
