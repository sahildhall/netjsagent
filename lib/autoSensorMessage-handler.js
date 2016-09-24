/**
 * Created by Siddhant on 18-09-2015.
 */

var agentConfReader = require("./agent-setting");
var util = require("./util");

function AutoSensorMessageHandler(clientSocket)
{
    this.clientSocket = clientSocket;
    this.handleMessages();
}

AutoSensorMessageHandler.prototype.handleMessages = function()
{
    var clientSocket = this.clientSocket;

    var autoSensorMessage = "auto_sensor_thread_hotspot_data_req:appName=" + agentConfReader.getInstance() + ";appID="
        + agentConfReader.appID +  ";ndAppServerID=" + agentConfReader.ndAppServerID + ";ndAppServerHost="+agentConfReader.getServerName() +";tierName=" + agentConfReader.getTierName()
        +  ";tierID=" + agentConfReader.tierID + ";NDCollectorIP=" + agentConfReader.ndCollectorIP+";NDCollectorPort="
        + agentConfReader.ndlPort + ";testIdx=" + agentConfReader.testIdx+ "\n";

    util.logger.info(agentConfReader.currentTestRun+" | "+autoSensorMessage);

    if(agentConfReader.isToInstrument) {
        try {
            clientSocket.write(autoSensorMessage);
        }catch(e){util.logger.warn(agentConfReader.currentTestRun+" | "+e);}
    }
};


module.exports = AutoSensorMessageHandler;