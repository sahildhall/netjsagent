
var net = require('net');
var isToInstrument = false;

var agent = require("./agent-setting");
var DataMessageHandler = require("./datamessage-handler");
var util = require('./util');

var retrying=false;
var isClientConnected = false;
var backlog = [];
function dataConnHandler(){
    this.client=null;
    this.timeout=null;
    this.dataMsgHandler=null;

}

dataConnHandler.prototype.createDataConn = function(){
    try {

        var self = this;

        this.client = new net.Socket();

        this.client.on('error', function(err) {
               // util.logger.warn(agent.currentTestRun+" | Data connection], Received error event with retrying : "+retrying+", - "+err);
        });

        this.client.on('end', function(err) {
                //util.logger.warn(agent.currentTestRun+" | Data connection], Received end event with retrying : "+retrying+",  on socket-  "+err);
        });

        this.client.on('close', function(err) {
            self.connectToServer();
            util.logger.warn(agent.currentTestRun+" | Data connection], Received socket close event with retrying : "+retrying+", -  "+err);
        });

        this.client.on('connect', function() {
            try {
                clearTimeout(self.timeOut);

                if( backlog.length )
                {
                    for(var i= 0, len= backlog.length; len>i; ++i)
                        self.client.write(backlog[i]);

                    backlog.length= 0;
                }

                util.logger.info(agent.currentTestRun+" | Data Connection established with NDCollector : Socket[addr="+agent.getNDCHost()+",port="+agent.getPort() + ",localport=" +this.localPort );

                self.dataMsgHandler = new DataMessageHandler(self);
            }
            catch(e){
                util.logger.warn(agent.currentTestRun+" | "+e);
            }

        });

        this.client.on("data", function (data) {
          //  console.log("data from ndc : " + data.toString());
        });

        this._connect();

    }catch(err){util.logger.warn("error" + err);}
};


dataConnHandler.prototype.connectToServer=function()
{
    if(!agent.isTestRunning) {
        util.logger.warn(agent.currentTestRun+" | Test run is not running .")
        return;
    }

    var self=this;

    if(self.client.writable)
        return;

    if(self.timeOut)
        return;

    self.timeOut = setTimeout(function () {
        try {
            self._connect();
            self.timeout=0;
            util.logger.warn(agent.currentTestRun+" | Timer for retrying Data connectoion expired. trying to connect...")
        }catch(e){util.logger.warn(agent.currentTestRun+" | "+e);}
    }, 60000);
}

dataConnHandler.prototype.closeConnection =function()
{
    util.logger.info(agent.currentTestRun+" | Closing the Data connection .");
/*    this.client.on('close',null);
    this.client.on('connect',null);*/
    if(this.client != null)
        this.client.destroy();
    delete this.client;
    delete this.dataMsgHandler ;
}

dataConnHandler.prototype._connect = function()
{
    if(!agent.isTestRunning) {
        util.logger.warn(agent.currentTestRun+" | Test is not running ,error in making data connection")
        return;
    }
    if(this.client.writable)
        return;


    try {
        this.client.connect(agent.getPort(), agent.getNDCHost());
    }
    catch(err) {
        util.logger.warn(err);
    }
};

dataConnHandler.prototype.write=function(data){
    try{

        if(this.client.writable) {
            this.client.write(data)
        }
        else {
            if(backlog.length <= 500)
                backlog.push(data)
        }
        /*if(agent.dataConnHandler )
            this.client.write(data)*/
    }
    catch(e){
        util.logger.warn(e);
    }

};

module.exports = dataConnHandler;