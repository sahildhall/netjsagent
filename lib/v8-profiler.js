/**
 * Created by Sahil on 7/29/16.
 */


var fs = require('fs'),
    Readable = require('stream').Readable,
    zlib = require('zlib');
var profiler
try {
    profiler = require('cavisson-profiling-tool');
}catch(e){console.log("Can't find module cavisson-profiling-tool ")}
var stringBuffer = require('./flowpath/StringBuffer.js').StringBuffer;
var agentSetting = require('./agent-setting.js');
var ut = require('./util');
var gzip = zlib.createGzip();
var timeOutToStartHeartBeat = undefined
var mkdirp = require('mkdirp')

function v8_profiler () {

    this.stream;
    this.snapshot1;
    this.compressMode = 1;
    this.downloadFile = 2;
    this.fileName = '/tmp/'+new Date()+'.heapsnapshot'
    this.gzip
    this.dataSocket = undefined

}

v8_profiler.prototype.initProfilerObject = function(clientMsg,dataSocket,errorCallBack){
    /* * *
         *  Parsing the clientMsg
         * * */
    try{
        var self = this
        var splitArr = clientMsg.split(";"),dir,compleFilePath;
        for(var i=0; i<splitArr.length; i++){

            if(splitArr[i] == '') continue

            if(splitArr[i].indexOf("CompressMode") != -1){
                var compressMode = parseInt(splitArr[i].split("=")[1]);
                if(compressMode != undefined )self.compressMode = compressMode
            }
            else if(splitArr[i].indexOf("DownloadFile") != -1){
                var downloadFile = parseInt(splitArr[i].split("=")[1])
                if(downloadFile != undefined )self.downloadFile =  downloadFile
            }
            else if(splitArr[i].indexOf("FileName") != -1){

                var tmpfileName;
                compleFilePath = splitArr[i].split("=")[1]
                if(compleFilePath) {
                    dir = compleFilePath.substring(0, compleFilePath.lastIndexOf('/'))
                    tmpfileName = compleFilePath.substring(compleFilePath.lastIndexOf('/') + 1)
                }
                if(!tmpfileName || tmpfileName == '')
                    self.fileName = (compleFilePath ? compleFilePath : '/tmp/') +new Date()+'.heapsnapshot'
                else
                    self.fileName = compleFilePath
            }
        }

        if(self.compressMode == 1){
            var ext = self.fileName.substring(self.fileName.lastIndexOf('.')+1)
            if(ext !== 'gz'){
                self.fileName = self.fileName + '.gz'
            }
            self.gzip = zlib.createGzip({chunkSize:1024*1024*5,level:9,highWaterMark:1024*1024*10});
        }

        self.dataSocket = dataSocket

        if(self.downloadFile == 1 || self.downloadFile == 0){
            self.mkDirOnServer(dir,errorCallBack)
        }
    }
    catch(e){
        ut.logger.error(agentSetting.currentTestRun, '| Error While Initializing the v8_Object',e )
    }
}

v8_profiler.prototype.mkDirOnServer = function(fpath,errorCallBack){
    try{
        var self = this
        if(!fs.existsSync(fpath)){
            mkdirp.sync(fpath,function(err){
                if(err){
                    self.cleanV8Object(err,errorCallBack)
                }
            })
        }
        else
            fs.accessSync(fpath, fs.constants.X_OK | fs.constants.W_OK | fs.constants.R_OK)
    }catch(e){
        self.cleanV8Object(e,errorCallBack)
        ut.logger.error(agentSetting.currentTestRun, '| Error: While Creating the Directory : ',e)
    }
}

v8_profiler.prototype.TakeSnapShot = function() {

    try{
        var self = this
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler.takeHeapSnapShot , Taking heapsnapshot On New Connection (mb)", parseInt((process.memoryUsage().heapUsed / 1048576).toFixed(3)))
        self.snapshot1 = profiler.takeSnapshot();
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler.takeHeapSnapShot , Heapdump taken successfully (mb)", parseInt((process.memoryUsage().heapUsed / 1048576).toFixed(3)))
        self.stream = self.snapshot1.export()
        self.stream._readableState.highWaterMark = 1024 * 1024 * 10;
        self.stream._writableState.highWaterMark = 1024 * 1024 * 10;
    }catch(e){
        ut.logger.error(agentSetting.currentTestRun, '| Error: While Taking Heap Snapshot : ',e )
    }
}

v8_profiler.prototype.takeHeapSnapShotOnNewConn = function(clientSocket,dataSocket,clientMsg,asyncId,command,errorCallBack){

    try {
        var self = this
        if (!profiler) {
            ut.logger.error(agentSetting.currentTestRun, '| Cannot load cavisson-profiling-tool ,cavisson-profiling-tool value is :', profiler)
            throw new Error('! profiler')
        }

        self.initProfilerObject(clientMsg,dataSocket,errorCallBack)

        self.dataSocket.write("run_async_command_data_req:Command=" + command + ";Id=" + asyncId + ";Tier=" + agentSetting.tier + ";Server=" + agentSetting.server + ";Instance=" + agentSetting.instance + ";Size=-1;CompressMode="+self.compressMode+"\n")
        self.dataSocket.write("Complete\n")

        self.TakeSnapShot()

        if ( self.downloadFile == 0 ){
            if(self.compressMode == 0){
                self.CreateUnCompressHeapFile(errorCallBack)
            }
            else if(self.compressMode == 1){
                self.CreateCompressHeapFile(errorCallBack)
            }
        }
        else if ( self.downloadFile == 1){
            if(self.compressMode == 0){
                self.CreateAndDownloadUncompressHeap(errorCallBack)
            }
            else if(self.compressMode == 1){
                self.CreateAndDownloadCompressHeap(errorCallBack)
            }
        }
        else if ( self.downloadFile == 2 ){
            if ( self.compressMode == 0 ){
                self.DownloadUnCompressHeap(errorCallBack)
            }
            else if ( self.compressMode == 1 ){
                self.DownloadCompressHeap(errorCallBack)
            }
        }
    } catch (e){
        self.cleanV8Object(e,errorCallBack)
        ut.logger.info(agentSetting.currentTestRun + "| Error occured during Taking HeapDump main (Catch): "+e)
    }
}

/* * *
* case : UnCompress HeapDump on Server Only       : [function] CreateUnCompressHeapFile
* case : UnCompress HeapDump on Server and NDC    : [function] CreateAndDownloadUncompressHeap
* case : Compress HeapDump on Server and NDC      : [function] CreateAndDownloadCompressHeap
* case : UnCompress HeapDump on NDC Only          : [function] DownloadUnCompressHeap
* case : Compress HeapDump on NDC Only            : [function] DownloadCompressHeap
* * */

v8_profiler.prototype.DownloadCompressHeap = function(errorCallBack){

    try{
        var self = this
        var zstream = self.stream.pipe(self.gzip)
        zstream.pipe(self.dataSocket.client,{end:false}).on('error',function(err){
            if(err)
                zstream.pause()
        })
        self.dataSocket.client.on('drain',function(){zstream.resume()})
        zstream.on('end',function(){self.handleEnd(errorCallBack)})
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Compressed File Transfered")
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.DownloadUnCompressHeap = function(errorCallBack){

    try{
        var self = this
        self.stream.pipe(self.dataSocket.client,{end:false}).on(('error'),function(err){
            if(err)
                self.stream.pause()
        })
        self.dataSocket.client.on('drain',function(){self.stream.resume()})
        self.stream.on('end',function(){self.handleEnd(errorCallBack)})
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : UnCompressed File Transfered")
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.CreateCompressHeapFile =  function(errorCallBack) {

    try {
        var self = this
        var wStream = fs.createWriteStream(self.fileName, {highWaterMark: 1024 * 1024 * 10})
        var zipped = self.stream.pipe(self.gzip).on('end',function(){self.handleEnd(errorCallBack)})
        zipped.pipe(wStream)
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Created Compressed file on server, Path :", self.fileName)
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.CreateUnCompressHeapFile =  function(errorCallBack) {

    try {
        var self = this
        var wStream = fs.createWriteStream(self.fileName, {highWaterMark: 1024 * 1024 * 10})
        self.stream.pipe(wStream)
        self.stream.on('end',function(){self.handleEnd(errorCallBack)})
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Created Uncompressed file on server, Path :", self.fileName)
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.CreateAndDownloadCompressHeap = function(errorCallBack) {

    try{
        var self = this
        var wStream = fs.createWriteStream(self.fileName,{highWaterMark:1024 * 1024 * 10})
        var zipped = self.stream.pipe(self.gzip).on('end',function(){self.sendFileToNDC(errorCallBack)})
        zipped.pipe(wStream)
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Created Compressed file on server, Path :",self.fileName)
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.CreateAndDownloadUncompressHeap = function(errorCallBack){

    try{
        var self = this
        var wStream = fs.createWriteStream(self.fileName,{highWaterMark:1024 * 1024 * 10})
        self.stream.pipe(wStream)
        self.stream.on('end',function(){self.sendFileToNDC(errorCallBack)})
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Created UnCompressed file on server, Path :",self.fileName)
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }

}

v8_profiler.prototype.sendFileToNDC = function(errorCallBack) {

    try{
        var self = this
        var rStream = fs.createReadStream(self.fileName, {highWaterMark: 1024 * 1024 * 10})
        self.dataSocket.client.on('drain', function () {
            rStream.resume()
        })

        rStream.pipe(self.dataSocket.client, {end: false}).on('error', function (err) {
            if (err) {
                rStream.pause()
            }
        })

        rStream.on('end',function(){self.handleEnd(errorCallBack)})
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Sending File to NDC")
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}


v8_profiler.prototype.downloadFileToNDC = function(fileName,deleteFile,errorCallBack) {

    try{
        var self = this
        var rStream = fs.createReadStream(fileName, {highWaterMark: 1024 * 1024 * 10})
        self.dataSocket.client.on('drain', function () {
            rStream.resume()
        })

        rStream.pipe(self.dataSocket.client, {end: false}).on('error', function (err) {
            if (err)
                rStream.pause()
        })

        rStream.on('end',function(){
            ut.logger.info(agentSetting.currentTestRun + " | End of Download Process Cycle");
            if(deleteFile == 1)
                fs.unlinkSync(fileName);
            self.handleEndDownloadFile(errorCallBack)
        });
        ut.logger.info(agentSetting.currentTestRun + " | v8_profiler : Downloading File to NDC")
    }
    catch(e){
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.handleEnd = function(errorCallBack){

    try{
        var self = this
        if (self.dataSocket.client && self.dataSocket.client._writableState && self.dataSocket.client._writableState.length == 0 ) {
             self.dataSocket.write('Heapdump:Result=OK;')

            ut.logger.info(agentSetting.currentTestRun + " | End of Taking Heapdump Process Cycle");
            self.cleanV8Object(undefined,errorCallBack)
        }
        else {
            if(self.dataSocket.client && self.dataSocket.client.writable)
                setTimeout(function(){self.handleEnd(errorCallBack)}, 2000)
            else{
                self.cleanV8Object(new Error('Connection is not there'),errorCallBack)
            }
        }
    }
    catch(e) {
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.handleEndDownloadFile = function(errorCallBack){

    try{
        var self = this
        if (self.dataSocket.client && self.dataSocket.client._writableState && self.dataSocket.client._writableState.length == 0 ) {
            ut.logger.info(agentSetting.currentTestRun + " | End of Taking Heapdump Process Cycle");
            self.cleanV8Object(undefined,errorCallBack)
        }
        else {
            if(self.dataSocket.client && self.dataSocket.client.writable)
                setTimeout(function(){self.handleEndDownloadFile(errorCallBack)}, 2000)
            else{
                self.cleanV8Object(undefined,errorCallBack)

            }
        }
    }
    catch(e) {
        self.cleanV8Object(e,errorCallBack)
    }
}

v8_profiler.prototype.cleanV8Object = function(e,errorCallBack){

    try{
        var self = this
        if(self.dataSocket){
            self.dataSocket.closeConnection();
        }
        if(self.snapshot1){
            delete self.snapshot1
        }
        self.stream = undefined;
        self.gzip = undefined;
        self.dataSocket = undefined;
        errorCallBack(e)
        ut.logger.info(agentSetting.currentTestRun + " | Cleaned the V8Object Instance . ")
    }
    catch(e){
        ut.logger.error(agentSetting.currentTestRun, '| Error: While Cleaning the V8 Object : ',e )
    }

}

v8_profiler.takeHeapSnapShot = function(clientSocket)
{
    try {
        if (!profiler) {
            ut.logger.error(agentSetting.currentTestRun, '| Cannot load cavisson-profiling-tool ,cavisson-profiling-tool value is :', profiler)
            agentSetting.isHeapDumpInProgress = false
            startTimer(clientSocket)
            return;
        }
        ut.logger.info(agentSetting.currentTestRun, "| profiler.takeHeapSnapShot , Taking heapsnapshot")

        /*
        1. If agent is busy in taking heap dump then agent will not send Heart beat msg to NDC,
        Because NDC will ignore that heartbeat and in that case agent will not rcv any heart beat reply,
         and after some threshold agent will close connection and make switchover
        2. NDC have timeout of 10 min for any request, so for each request agent pauses Heart beat interval for 10 min
         because if agent is sending any file that is taking more then 10 min to process, so agent will wait for complete transfer.
        * */

        clearInterval(agentSetting.reconnectTimer) ;agentSetting.reconnectTimer = undefined;     //Clearing reconnect timer interval
        clearTimeout(timeOutToStartHeartBeat) ; timeOutToStartHeartBeat= undefined
        if(!timeOutToStartHeartBeat){
            timeOutToStartHeartBeat = setTimeout(function(){
                startTimer(clientSocket)
            },600000)
        }
        var snapshot1 = profiler.takeSnapshot();
        var size = 0
        clientSocket.write("nd_meta_data_rep:action=get_heap_dump;Size=" + 0 + ";CompressMode=1\n");
        var stream = snapshot1.export();
        stream.on('data', function (chunk) {
            try {
                size += chunk.length;
                var flag = (clientSocket.write(zlib.gzipSync(chunk)), function (err) {
                })
                if (!flag) {
                    stream.pause();
                    ut.logger.info(agentSetting.currentTestRun + "There will be no additional data for 0.5 second.");
                    setTimeout(function () {
                        ut.logger.info(agentSetting.currentTestRun + 'Now data will start flowing again.');
                        stream.resume();
                    }, 500);
                }
            }catch (e){
                agentSetting.isHeapDumpInProgress = false
                ut.logger.error(agentSetting.currentTestRun + "Error in heap dump : ",e)
            }
        })
        stream.on('end', function () {
            try{
                clientSocket.write("nd_meta_data_rep:action=get_heap_dump;result=OK\n")
                ut.logger.info(agentSetting.currentTestRun + "nd_meta_data_rep:action=get_heap_dump;result=OK")
                ut.logger.info(agentSetting.currentTestRun + "Toatl dumped data : ", size)
                agentSetting.isHeapDumpInProgress = false
                snapshot1.delete();
            }catch (e){
                agentSetting.isHeapDumpInProgress = false
                ut.logger.error(agentSetting.currentTestRun + "Error in heap dump : ",e)
            }
        });
        stream.on('error', function (err) {
            ut.logger.error(agentSetting.currentTestRun + "Error in exporting heap data : ", err)
            agentSetting.isHeapDumpInProgress = false
            snapshot1.delete();
        });
    }
    catch(e){
        agentSetting.isHeapDumpInProgress = false
        ut.logger.error(agentSetting.currentTestRun + "Error in heap dump : ",e)
    }

    /*        snapshot1.export(function (err, data) {
     try {
     ut.logger.info(agentSetting.currentTestRun,"| v8_profiler.takeHeapSnapShot , Exporting heapsnapshot")
     if (err)
     ut.logger.info(agentSetting.currentTestRun+" | error in taking snapshot : "+err);

     if (data) {
     //Compressing data,to send over socket
     zlib.gzip(data, function (error, result) {
     if (error) throw error;
     var readStream = new Readable();            //Creating stream Object
     readStream.push(result);                   //Adding zip data in stream, because on socket data should be in small chunks ,so stream will give data in chunks
     readStream.push(null);                      //If null is not added in stream then , stream._read event will not call
     sendHeapDumpToNdc(readStream,result.length)
     })
     function sendHeapDumpToNdc(readStream,length){
     readStream.on('error',function(err){
     ut.logger.info(agentSetting.currentTestRun + " |Error in Reading Heap dump Data from stream",err)
     })

     clientSocket.write("nd_meta_data_rep:action=get_heap_dump;Size="+0+";CompressMode=1\n");
     var size= 0;
     readStream.on('data',function(chunk){
     ut.logger.info(agentSetting.currentTestRun + " |sending chunk to ndc " + chunk.length);
     size += chunk.length
     var flag = clientSocket.write(chunk, function (err) {})
     if (!flag) {
     readStream.pause();
     ut.logger.info(agentSetting.currentTestRun + "There will be no additional data for 1 second.");
     setTimeout(function () {
     ut.logger.info(agentSetting.currentTestRun + 'Now data will start flowing again.');
     readStream.resume();
     }, 1000);
     }
     })

     readStream.on('end',function(){
     clientSocket.write("nd_meta_data_rep:action=get_heap_dump;result=OK")
     ut.logger.info(agentSetting.currentTestRun+" |end event received. Data sent successfully,Total data  ",size);
     })
     }
     }
     else {
     clientSocket.write("nd_meta_data_rep:action=get_heap_dump;result=Error:'<'Unable to take heapDump please check in bci error log.>\n");
     ut.logger.warn(agentSetting.currentTestRun+" | Error in taking Heap dump ");
     }
     snapshot1.delete();
     }
     catch (err) {
     ut.logger.warn(agentSetting.currentTestRun+" | Error in taking Heap dump :" + err);
     }

     })*/
}

v8_profiler.createData = function(sb,data)
{
    sb.clear();
    sb.add(data);
    sb.add('\n')

    return sb;
}

v8_profiler.startCpuProfiling = function(clientSocket)
{
    try {
        if (!profiler) {
            ut.logger.error(agentSetting.currentTestRun, '| Cannot load cavisson-profiling-tool ,cavisson-profiling-tool value is :', profiler)
            startTimer(clientSocket);
            return
        }
        ut.logger.info(agentSetting.currentTestRun, "| Starting cpuProfiling ");
        clearInterval(agentSetting.reconnectTimer)          //Clearing reconnect timer interval
        agentSetting.reconnectTimer = undefined;
        profiler.startProfiling('', true);
        setTimeout(function () {
            var profile1 = profiler.stopProfiling();
            var sb = new stringBuffer();
            profile1.export(function (err, data) {
                ut.logger.info(agentSetting.currentTestRun, '| Going to export CPU profiling data')
                if (err)
                    ut.logger.info(agentSetting.currentTestRun + " | Error in cpu_profiling : " + err);
                try {
                    var profilingData = v8_profiler.createData(sb, data).toString() + "\n";

                    if (profilingData.length) {

                        clientSocket.write("nd_meta_data_rep:action=get_thread_dump;Size=" + profilingData.length + ";CompressMode=+(compressMode == false ? 0:1);" + "\n");
                        clientSocket.write(profilingData + "\n");
                        clientSocket.write("nd_meta_data_rep:action=get_thread_dump;result=Ok;" + "Size=" + profilingData.length + ";CompressMode=+(compressMode == false ? 0:1);" + "\n");
                        ut.logger.info(agentSetting.currentTestRun + " | Dumping cpu profiling data : \n" + profilingData.length);
                    }
                    else {
                        clientSocket.write("nd_meta_data_rep:action=get_thread_dump;result=Error:'<'Unable to take cpu_profiling please check in bci error log.>\n");
                        ut.logger.info(agentSetting.currentTestRun + " | Size of cpu profiling data is 0");
                    }
                    profile1.delete();
                    startTimer(clientSocket);
                }
                catch (err) {
                    startTimer(clientSocket);
                    ut.logger.warn(agentSetting.currentTestRun + " | Error in Dumping metarecord for Backend :" + err);
                }

            })
        }, agentSetting.nodejsCpuProfilingTime);                  //Profiling CPU for particular time
    }
    catch(e){
        startTimer(clientSocket);
        ut.logger.error("Error in CPU profiling",e)
    }
}

function startTimer(clientSocket){
    var conn = require('./controlmessage-handler')
    conn.startHealthCheckTimer(clientSocket);
}

v8_profiler.prototype.downloadFileOnNewConn = function(clientSocket,dataSocket,clientMsg,id,fileName,deleteFile,errorCallBack) {
    try {
        var self = this
        self.dataSocket = dataSocket;
        var stats = fs.statSync(fileName)
        var fileSizeInBytes = stats["size"]
        var msg = "download_file_data_req:Id=" + id + ";FileName=" + fileName + ";Tier=" + agentSetting.tier + ";Server=" + agentSetting.server + ";Instance=" + agentSetting.instance + ";Size=" + fileSizeInBytes + ";\n"
        ut.logger.info(msg)
        self.dataSocket.write(msg)
        self.dataSocket.write("File Downloaded\n")
        self.downloadFileToNDC(fileName, deleteFile, errorCallBack)

    } catch (e) {
        self.cleanV8Object(e,errorCallBack)
        ut.logger.error(" Error in Downloading File - : ", e)
    }
}
module.exports = v8_profiler;
