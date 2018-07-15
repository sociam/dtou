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
            if (!blob.agreement){
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
                var dtou = got.dtou,
                    agreement = blob.agreement;
                if(got.dtou){
                    const secrets = _.cloneDeep(dtou.secrets);
                    var inSecrets = secrets;
                    dtou.secrets = {};
                    if (agreement.definitions.substitute && secrets.substituteHtml){
                        dtou.secrets.substituteHtml = secrets.substituteHtml;
                    }
                    if (dtou.definitions.pingback){
                        var c = _.get(secrets, ['pingbackData',blob.authorid, 'count'], 0);
                        _.updateWith(inSecrets, ['pingbackData',blob.authorid,'count'], c+1);
                        _.set(inSecrets, ['pingbackData', blob.authorid, 'author'], blob.author);
                    }
                    return storageUtils.update(blob.id, function(item){
                        item.dtou.secrets = inSecrets;
                        return item;
                    }).then(function(){
                        return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                    });
                }
                return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
            }).catch(function(e) {
                return {error: e.message};
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
            return Promise.resolve({error: e});
        }
    };

module.exports = {
    outboundProcessDtou: outboundProcessDtou,
    inboundController: inboundController
}