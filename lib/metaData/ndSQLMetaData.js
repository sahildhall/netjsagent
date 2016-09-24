/**
 * Created by Siddhant on 07-09-2016.
 */

function ndSQLMetaData(){

}

var nonPreparedQueryMap = new Object();
var preparedQueryMap = new Object();
var nonPreparedQueryId = 6;     //Every query has unique id & used to dump quey meta record(23) , starting from 6 because 1-6 id are reserved
var agentSetting = require('./../agent-setting');
var ut = require('./../util');
var ndSQLProcessor = require('./../flowpath/ndSQLProcessor');

ndSQLMetaData.getNonPreparedValue = function(key){
    return nonPreparedQueryMap[key];
};

ndSQLMetaData.getNonPreparedKey = function(value){

    var key;
    var keys = Object.keys(nonPreparedQueryMap);
    for( var i = 0; i< keys.length; i++) {
        if(nonPreparedQueryMap[keys[i]] == value){
            key = keys[i];
        }
    };
    return key;
};

ndSQLMetaData.setNonPrepared = function(command, fpId) {
    if (nonPreparedQueryMap[command] == undefined) {

        nonPreparedQueryId = nonPreparedQueryId + 1;
        nonPreparedQueryMap[command] = nonPreparedQueryId;
        ndSQLProcessor.dumpNonPreparedSQLQueryEntry(command, fpId, nonPreparedQueryId);
    }
    return ;
};

ndSQLMetaData.getAll = function(){
    var data = [];
    var keys = Object.keys(nonPreparedQueryMap);
    for (var i = 0; i < keys.length; i++) {
        var record = "na";
        var val = ndSQLMetaData.getNonPreparedKey(i);
        record = '23'  + ",0," + i + "," + val + '\n';
        data.push(record);
    }
    return data;
};

ndSQLMetaData.clear = function(){
    nonPreparedQueryMap = new Object();
    nonPreparedQueryId = 0;
};

module.exports = ndSQLMetaData;
