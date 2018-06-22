// - TODO refactor this to use a+ promises

// - simple server w/ api for interacting with local telehash endpoint
const express   = require('express'),
    bp          = require('body-parser'),
    telehashUtils    = require('./telehashUtils'),
    cfg         = '/opt/dtou_router.json',
    app         = express(),
    port        = 3000;

// Error.stackTraceLimit = 16;

function BadRequestException(msg, wrapped) {
    var e = Error.call(this, msg);
    e.name = "Bad Request";
    e.details = wrapped;
    e.status = 400;
    return e;
}

var telehashRouter = function(mesh) {
    // - express router for telehash rpcs
    var _telehashRouter = express.Router();

    // - retrieve router info (i.e. local id)
    _telehashRouter.route('/router')
        .get(function(req, resp, next) {
            resp.send({
                "mesh": mesh.json(),
                "uri":  mesh.uri()
            });
        });

    // - connect to another telehash endpoint
    _telehashRouter.route('/connect')
        .post(function(req, resp, next) {
            // extract the endpoint
            console.log('--> POST to /connect', req.body);
            if(!req.body.endpoint) return next(new BadRequestException("POST /connect missing field: endpoint", {}));
            telehashUtils.connect(req.body.endpoint, null).then(function(link) {
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
            telehashUtils.fire(req.body.payload, req.body.endpoint).then(function(out){
                resp.send(out);
            }).catch(function(e){
                return next(e);
            });
        });

    return _telehashRouter;
}

// - cb for actually running the app
// - if running the docker container, use docker run -p 8080:3000 or equiv
var bootstrap = function(mesh) {
    // - we're using json
    app.use(bp());

    // - register th router
    const _telehashRouter = telehashRouter(mesh);
    app.use('/telehash', _telehashRouter);

    // - and customise error handling
    app.use(function(e, req, resp, next) {
        console.error('--> exception:', e.stack);
        if (e.status) return resp.status(e.status).send({"error": e.message});
        next(e);
    });
    // - listen to the default port
    app.listen(port, function(e) {
        if (e) throw e;
        console.log('--> dtou router available on port', port);
    });
};

// var id = telehashUtils.id();
// var mesh = telehashUtils.router(id);
// var server = bootstrap(mesh);

telehashUtils.id().then(function(id) {
    return telehashUtils.router(id);
}).then(function(mesh) {
    return bootstrap(mesh);
}).catch();
