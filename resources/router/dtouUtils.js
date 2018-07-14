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
    outboundCheckDtou = function(blob) {
        // - A asks entity owner B for entity's dtous; handle said dtous
        if(!blob.type) throw new DtouException('dtou blob missing field: type');
        if(blob.cmd) console.warn('dtou blob already had field: cmd', blob);
        _.merge(blob, {cmd: commands.get_defs});
        return blob;
    },
    _inboundCheckDtou = function(blob) {
        // - B processes incoming request for dtou definitions from A, send them out
        if (blob.type === dtouTypes.tweet) {
            if(!blob.id) throw new DtouException('blob missing field: id');
            return storageUtils.get(blob.id).then(function(got){
                if(got.dtou) got.dtou.secrets = {};
                return got;
            }).catch(function(e) {
                return {error: e.message};
            });
        }
    },
    outboundProcessDtou = function(blob) {
        // - A selects dtous + ask for further operations on B's data wrt dtous
        if(!blob.type) throw new DtouException('dtou blob missing field: type');
        if(blob.cmd) console.warn('dtou blob already had field: cmd', blob);
        _.merge(blob, {cmd: commands.process_dtous});
        return blob;
    },
    _inboundProcessDtou = function(blob) {
        // - B releases data
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
    outboundCheckDtou: outboundCheckDtou,
    outboundProcessDtou: outboundProcessDtou,
    inboundController: inboundController
}