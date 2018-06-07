// - TODO refactor this to use a+ promises

// - simple server w/ api for interacting with local telehash endpoint
const express   = require('express'),
    bp          = require('body-parser'),
    telehashUtils    = require('./telehashUtils'),
    cfg         = '/opt/dtou_router.json',
    app         = express(),
    port        = 3000;

Error.stackTraceLimit = 8;

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
            console.error('--> POST to /connect', req.body);
            if(!req.body.endpoint) return next(new BadRequestException("POST /connect missing field: endpoint", {}));
            var link = mesh.link(req.body.endpoint);
            // - create link
            if(!link) return next(new telehashUtils.TelehashException("failed to link to endpoint", {}));
            link.status(function(e) {
                if(e) return next(new telehashUtils.TelehashException("telehash link bad status ", e));
                console.log('--> endpoint: ', req.body.endpoint, ' connected');
            })
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
});
