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
    _inboundProcessDtou = function(blob, dtou_identifier) {
        // - B releases data
        // - TODO all DTOU logic will go here, e.g. future project: DTOU spec lang
        if(blob.type === dtouTypes.tweet) {
            if(!blob.id) throw new DtouException('blob missing field: id');
            return storageUtils.get(blob.id).then(function(got){
                var myDtou = got.dtou,
                    theirAgreement = blob.agreement,
                    consumer = blob.agreement.consumer,
                    newSecrets = _.cloneDeep(myDtou.secrets);
                    myDtou.secrets = {};
                if(!myDtou || !theirAgreement.definitions.substitute){
                    // - if reader hasn't agreed to my dtous, send out the empty secrets
                    return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                } else {
                    // - otherwise, modify according to my secrets
                    if (newSecrets.substituteHtml){
                        myDtou.secrets.substituteHtml = newSecrets.substituteHtml;
                    }
                    // - if pingback and delete, check if incoming request for data consumption reaches limit
                    var c = _.get(newSecrets, ['pingbackData', dtou_identifier, 'count'], 0),
                        d = _.get(myDtou, ['definitions', 'delete'], 0),
                        limitReached = myDtou.definitions.pingback && c > d;
                    if(limitReached){
                        myDtou.secrets.substituteHtml = 'Read-limit reached; content removed.';
                    }
                    // - otherwise, modify my secrets
                    else if (myDtou.definitions.pingback){
                        var now = new Date();
                        // - this whole blob is to 1. init the previous time if it doesn't exist;
                        //   2. update values if readtime*minutes has passed since then
                        _.update(newSecrets, ['pingbackData', dtou_identifier, 'stamp'], function(prev){
                            if(!prev) return now;
                            if(myDtou.definitions.readtime){
                                var stamp = new Date(prev);
                                stamp.setMinutes(stamp.getMinutes() + myDtou.definitions.readtime);
                                if(stamp.getTime() < now.getTime()) {
                                    _.set(newSecrets, ['pingbackData', dtou_identifier, 'count'], c+1);
                                    return now;
                                }
                            }
                            return prev;
                        });
                        _.set(newSecrets, ['pingbackData', dtou_identifier, 'author'], _.get(consumer, ['twitter', 'author']));
                        _.set(newSecrets, ['pingbackData', dtou_identifier, 'authorid'], _.get(consumer, ['twitter', 'authorid']));
                    }
                    // - ensure that we've updated our own secrets first before releasing outgoing data
                    return storageUtils.update(blob.id, function(item){
                        item.dtou.secrets = newSecrets;
                        return item;
                    }).then(function(){
                        console.info('--> [DTOU] updated dtou for', blob.id, newSecrets);
                        return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                    });
                }
            });
        }
    },
    inboundController = function(blob, dtou_identifier) {
        // - redirects all inbound messages to the right places
        try {
            if (blob.cmd === commands.get_defs) {
                return _inboundCheckDtou(blob);
            } else if (blob.cmd === commands.process_dtous) {
                return _inboundProcessDtou(blob, dtou_identifier);
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