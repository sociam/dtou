const storageUtils  = require('./storageUtils'),
    _               = require('lodash'),
    commands        = {
        get_defs: 'get_defs',
        process_dtous: 'process_dtous'
    },
    dtouTypes       = {
        tweet:  'tweet'
    };

function DtouException(msg, wrapped, status) {
    var e = Error.call(this, (wrapped) ? (msg, wrapped.message) : msg);
    e.name = "DTOU Exception";
    e.details = wrapped;
    e.status = status ? status : 500;
    return e;
}

var handlers = {
        _substituteHandler: {
            inbound: function(data) {

            },
            outbound: function(data) {

            }
        },
        _pingbackHandler: {
            inbound: function(data) {

            },
            outbound: function(data) {

            }
        }
    },
    outboundProcessDtou = function(blob) {
        // - A selects dtous + ask for further operations on B's data wrt dtous
        if(!blob.type) throw new DtouException('dtou blob missing field: type');
        if(blob.cmd) console.warn('dtou blob already had field: cmd', blob);
        if(blob.type === dtouTypes.tweet){
            var slim = _.omit(blob, ['text', 'html', 'conversationId']);
            if (!blob.agreement || Object.keys(blob.agreement).length === 0){
                return Promise.resolve(_.merge(slim, {cmd: commands.get_defs}));
            }
            return Promise.resolve(_.merge(slim, {cmd: commands.process_dtous}));
        }
    },
    _inboundCheckDtou = function(blob) {
        // - B processes incoming request for dtou definitions from A, send them out
        if(blob.type === dtouTypes.tweet) {
            if(!blob.id) throw new DtouException('blob missing field: id');
            return storageUtils.get(blob.id).then(function(got){
                if(got.dtou) got.dtou.secrets = {};
                return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
            }).catch(function(e) {
                return {error: e.message};
            });
        }
    },
    _inboundProcessDtou = function(blob) {
        // - B releases data
        // - TODO all DTOU logic will go here, e.g. future project: DTOU spec lang
        if(blob.type === dtouTypes.tweet) {
            if(!blob.id) throw new DtouException('blob missing field: id');
            return storageUtils.get(blob.id).then(function(got){
                var myDtou = got.dtou,
                    theirAgreement = blob.agreement,
                    secrets = _.cloneDeep(myDtou.secrets);
                    myDtou.secrets = {};
                if(!myDtou || !theirAgreement.definitions.substitute){
                    return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                } else {
                    // - modify outgoing data
                    if (secrets.substituteHtml){
                        myDtou.secrets.substituteHtml = secrets.substituteHtml;
                    }
                    // - modify my own stored secrets
                    if (myDtou.definitions.pingback){
                        var now = new Date(),
                            timeReached = false;
                        // - this whole blob is to 1. if not existing, init values;
                        //   2. update values if readtime*hours has passed
                        _.update(secrets, ['pingbackData', blob.authorid, 'stamp'], function(prev){
                            if(!prev) return now;
                            var stamp = new Date(prev);
                            if(myDtou.definitions.readtime){
                                stamp.setMinutes(stamp.getMinutes() + myDtou.definitions.readtime);
                                if(stamp.getTime() < now.getTime()) {
                                    timeReached = true;
                                    return now;
                                }
                            }
                            return prev;
                        });
                        _.update(secrets, ['pingbackData', blob.authorid, 'count'], function(count){
                            if(!count) return 1;
                            else if (timeReached) return count + 1;
                            else return count;
                        });
                        _.set(secrets, ['pingbackData', blob.authorid, 'author'], blob.author);
                    }
                    // - ensure that we've updated our own secrets first before releasing outgoing data
                    return storageUtils.update(blob.id, function(item){
                        item.dtou.secrets = secrets;
                        return item;
                    }).then(function(){
                        console.info('--> [DTOU] updated dtou for', blob.id, secrets);
                        return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                    });
                }
            });
        }
    },
    inboundController = function(blob) {
        // - redirects all inbound messages to the right places
        try {
            if (blob.cmd === commands.get_defs) {
                return _inboundCheckDtou(blob);
            } else if (blob.cmd === commands.process_dtous) {
                return _inboundProcessDtou(blob);
            } else {
                throw new DtouException('blob has weird cmd block', blob);
            }
        } catch(e) {
            console.error('--> [DTOU] inbound dtou controller error: ', e);
            return Promise.resolve({error: e});
        }
    };

module.exports = {
    outboundProcessDtou: outboundProcessDtou,
    inboundController: inboundController
}