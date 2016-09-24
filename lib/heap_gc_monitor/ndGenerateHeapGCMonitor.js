/**
 * Created by Sahil on 8/9/16.
 */

var ndHeapGCMonitorData = require('./ndHeapGCMonitorData');
var stringBuffer = require('../flowpath/StringBuffer.js').StringBuffer;
var AgentSetting = require('../agent-setting');
var util = require('../util')

function generatHeapMonitor(){}


generatHeapMonitor.createRecord = function(sb){

    var vectorPrefix = AgentSetting.tierName + AgentSetting.ndVectorSeparator + AgentSetting.ndAppServerHost + AgentSetting.ndVectorSeparator + AgentSetting.appName ;//+ AgentSetting.ndVectorSeparator;
    var vectorPrefixID = AgentSetting.tierID + "|" + AgentSetting.appID + "|" + "1";

    var memoryUsage = process.memoryUsage() ;

    var rss = 0;
    var heapUsed = 0;
    var heapTotal = 0;

    rss = memoryUsage.rss;
    rss = parseInt((rss / 1048576).toFixed(3));     //bytes to MB

    heapTotal = memoryUsage.heapTotal;
    heapTotal = parseInt((heapTotal / 1048576).toFixed(3));

    heapUsed = memoryUsage.heapUsed;
    heapUsed = parseInt((heapUsed / 1048576).toFixed(3));


        sb.clear();

    sb.add('88,');
    sb.add(vectorPrefixID);
    sb.add(':');
    sb.add(vectorPrefix);
//    sb.add('HeapGCMonitor');
    sb.add('|');
    sb.add(ndHeapGCMonitorData.num_full_gc);
    sb.add(' ');
    sb.add(ndHeapGCMonitorData.num_inc_gc);
    sb.add(' ');
    sb.add(rss);
    sb.add(' ');
    sb.add(heapTotal);
    sb.add(' ');
    sb.add(heapUsed);
    sb.add('\n');

}

generatHeapMonitor.dumpData = function()
{
    try{

        if (AgentSetting.isToInstrument && AgentSetting.autoSensorConnHandler) {
            var sb = new stringBuffer();
            generatHeapMonitor.createRecord(sb);

            AgentSetting.autoSensorConnHandler.write(sb.toString());
        }

        //Clearing all values .
        ndHeapGCMonitorData.reset();
    }
    catch(err) {
        util.logger.warn(AgentSetting.currentTestRun+" | Cant dump Event monitoring data : " + err);
    }
}

module.exports = generatHeapMonitor ;