// - TODO refactor this to use a+ promises

// - simple server w/ api for interacting with local telehash endpoint
const express       = require('express'),
    bp              = require('body-parser'),
    telehashUtils   = require('./telehashUtils'),
    dtouUtils       = require('./dtouUtils'),
    url             = require('url'),
    _               = require('lodash'),
    cfg             = '/opt/dtou_router.json',
    app             = express(),
    port            = (process.env.DTOU_PORT) ? process.env.DTOU_PORT : 80;

// Error.stackTraceLimit = 16;

function BadRequestException(msg, wrapped) {
    var e = Error.call(this, msg);
    e.name = "Bad Request";
    e.details = wrapped;
    e.status = 400;
    return e;
}

// - convenience function to wrap connection bootstrapping
var _connectWithPrep = function(endpoint, resp, next, thUtils) {
    var loc = endpoint;
    var fun = thUtils.connect;
    try {
        var parsed = url.parse(endpoint);
        if (parsed.hostname) {
            loc = parsed.hostname;
            fun = thUtils.bootstrap;
        }
    } catch (e) {}

    return fun(loc);
}

var telehashRouter = function(thUtils) {
    // - express router for telehash rpcs
    var _telehashRouter = express.Router();

    // - retrieve router info (i.e. local id)
    _telehashRouter.route('/router')
        .get(function(req, resp, next) {
            resp.send({
                "mesh": thUtils.mesh.json(),
                "uri":  thUtils.mesh.uri()
            });
        });

    // - get link info
    _telehashRouter.route('/links')
        .get(function(req, resp, next) {
            resp.send(thUtils.links());
        });

    // - connect to another telehash endpoint
    _telehashRouter.route('/connect')
        .post(function(req, resp, next) {
            // extract the endpoint
            console.log('--> POST to /connect', req.body);
            if(!req.body.endpoint) return next(new BadRequestException("POST /connect missing field: endpoint", {}));
            _connectWithPrep(req.body.endpoint, resp, next, thUtils).then(function(link) {
                resp.send({
                    "link": link.json
                });
            }).catch(function(e) {
                return next(e);
            });
        });

    // - internal thtp proxy
    _telehashRouter.route('/data')
        .post(function(req, resp, next) {
            // extract the endpoint
            console.log('--> POST to /data', req.body);
            if(!req.body.endpoint) return next(new BadRequestException("POST /data missing field: endpoint", {}));
            if(!req.body.payload) return next(new BadRequestException("POST /data missing field: payload", {}));
            thUtils.fire(req.body.payload, req.body.endpoint).then(function(out){
                resp.send(out);
            }).catch(function(e){
                return next(e);
            });
        });

    return _telehashRouter;
};

var dtouRouter = function(thUtils) {
    var _dtouRouter = express.Router();

    // - uses same data model as stored in pdb for convenience
    _dtouRouter.route('/ask_peer')
        .post(function(req, resp, next) {
            console.log('--> post /definitions', req.body);
            // - TODO make this more generic for media besides thtp
            if(!req.body.endpoint) return next(new BadRequestException("POST /dtou/definitions missing field: endpoint", {}));
            // _connectWithPrep(req.body.router, resp, next, thUtils).then(function(link) {
            //         var updated = dtouUtils.outboundCheckDtou(req.body.payload);
            dtouUtils.outboundProcessDtou(req.body.payload).then(function(updated) {
                return thUtils.fire(updated, req.body.endpoint);
            }).then(function(out){
                resp.send(out);
            }).catch(function(e) {
                return next(e);
            // return thUtils.fire(updated, req.body.endpoint).then(function(out){
            //     resp.send(out);
            // }).catch(function(e) {
            //     return next(e);
            });
        });

    return _dtouRouter;
}


// - cb for actually running the app
// - if running the docker container, use docker run -p 8080:3000 or equiv
var bootstrap = function() {
    const thUtils = telehashUtils.instance(dtouUtils.inboundController).then(function(thUtils){
        // - we're using json
        app.use(bp());

        // - register th router
        const _telehashRouter = telehashRouter(thUtils),
            _dtouRouter = dtouRouter(thUtils);

        app.use(function(req, res, next) {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            next();
        });

        app.use('/telehash', _telehashRouter);
        app.use('/dtou', _dtouRouter);

        // - and customise error handling
        app.use(function(e, req, resp, next) {
            console.error('--> exception:', e.stack);
            if (e.status) return resp.status(e.status).send({"error": e.message, "details": e.details});
            next(e);
        });

        // - listen to the default port
        app.listen(port, function(e) {
            if (e) throw e;
            console.log('--> dtou router available on port', port);
        });
    });
};

// var id = telehashUtils.id();
// var mesh = telehashUtils.router(id);
// var server = bootstrap(mesh);

bootstrap();
