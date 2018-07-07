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
    port            = 80;

// Error.stackTraceLimit = 16;

function BadRequestException(msg, wrapped) {
    var e = Error.call(this, msg);
    e.name = "Bad Request";
    e.details = wrapped;
    e.status = 400;
    return e;
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
            var endpoint = req.body.endpoint;
            var fun = thUtils.connect;
            try {
                var parsed = url.parse(req.body.endpoint);
                if (parsed.hostname) {
                    endpoint = parsed.hostname;
                    fun = thUtils.bootstrap;
                }
            } catch (e) {}

            fun(endpoint).then(function(link) {
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
    _dtouRouter.route('/definition')
        .post(function(req, resp, next) {
            if (req.body.type === 'tweet') {
                // - TODO make this more generic for not only thtp
                if(!req.body.endpoint) {
                    return next(new BadRequestException("POST /data missing field: endpoint", {}));
                }
                var updated = dtouUtils.inboundController(req.body);
                thUtils.fire(updated, req.body.endpoint).then(function(out) {
                    resp.send(out);
                }).catch(function(e){
                    next(e);
                });
            }
            else next(new BadRequestException('POST /dtou/definitions bad field: type'));
        });

    return _dtouRouter;
}


// - cb for actually running the app
// - if running the docker container, use docker run -p 8080:3000 or equiv
var bootstrap = function() {
    const thUtils = telehashUtils.instance().then(function(thUtils){
        // - we're using json
        app.use(bp());

        // - register th router
        const _telehashRouter = telehashRouter(thUtils),
            _dtouRouter = dtouRouter(thUtils);

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
