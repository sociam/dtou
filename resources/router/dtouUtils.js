const storageUtils  = require('./storageUtils'),
    _               = require('lodash'),
    commands        = {
        get_defs: 'get_defs',
        process_dtous: 'process_dtous'
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
        if(blob.cmd) throw new DtouException('blob already had cmd block', blob);
        _.merge(blob, {cmd: commands.get_defs});
        return blob;
    },
    _inboundCheckDtou = function(blob) {
        // - B processes incoming request for dtou definitions from A, send them out
        if (blob.type === 'tweet') {
            return storageUtils.get(blob._id).then(function(got){
                return {dtou: got.dtou};
            });
        }
    },
    outboundProcessDtou = function() {
        // - A acks dtous + ask for further operations on B's data
    },
    _inboundProcessDtou = function() {
        // - B releases data
    },
    inboundController = function(blob) {
        // - redirects all inbound messages to the right places
        if(blob.cmd === commands.get_defs) {
            return _inboundCheckDtou(blob);
        } else if (blob.cmd === commands.process_dtous){

        } else {
            throw new DtouException('blob has weird cmd block', blob);
        }
    };

module.exports = {
    inboundController: inboundController
}