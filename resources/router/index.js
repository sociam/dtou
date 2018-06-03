// - TODO refactor this to use a+ promises

// - simple server w/ api for interacting with local telehash endpoint
const express   = require('express'),
    bp          = require('body-parser'),
    jsonfile    = require('jsonfile'),
    telehash    = require('telehash'),
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

function TelehashException(msg, wrapped) {
    var e = Error.call(this, msg);
    e.name = "Telehash Exception";
    e.details = wrapped;
    e.status = 500;
    return e;
}

// class TelehashException extends Error {
//     constructor(msg, wrapped) {
//         super(msg);
//         this.name = "Telehash Exception";
//         this.details = wrapped;
//         this.status = 500;
//     }
// }

// - cb for actually running the app
var bootstrap = function(mesh) {
    // - we're using json
    app.use(bp());

    //
    // - API endpoints
    //
    // - retrieve router info (i.e. local id)
    app.get('/router', function(req, resp, next) {
        resp.send({
            "mesh": mesh.json(),
            "uri":  mesh.uri()
        });
    });
    // - connect to another endpoint
    app.post('/connect', function(req, resp, next) {
        // extract the endpoint
        console.error('--> POST to /connect', req.body);
        if(!req.body.endpoint) return next(new BadRequestException("POST /connect missing field: endpoint", {}));
        var link = mesh.link(req.body.endpoint);
        // - create link
        if(!link) return next(new TelehashException("failed to link to endpoint", {}));
        link.status(function(e) {
            if(e) return next(new TelehashException("telehash link bad status ", e));
            console.log('--> endpoint: ', req.body.endpoint, ' connected');
        })
    });

    // - and customise error handling
    app.use(function(e, req, resp, next) {
        console.log('--> exception:', e.stack);
        if (e.status) return resp.status(e.status).send({"error": e.message});
        next(e);
    });
    // - listen to the default port
    app.listen(port, function(e) {
        if (e) throw e;
        console.log('--> dtou router available on port', port);
    });
};

// - cache generated endpoint identifier & retrieve
// - give this a cb to bootstrap the server
var _id =  function(cb) {
    return telehash.generate(function (e, generated) {
        if(e) throw new TelehashException("router endpoint generation failed", e);
        console.log('--> id generated (hashname):', generated.hashname);
        cb(generated);
    });
}

// - router init
var _router = function(endpoint) {
    // - create mesh
    var mesh = telehash.mesh({id: endpoint}, function(e, mesh) {
        if(e)throw new TelehashException("mesh generation failed", e);
        console.log('--> mesh created. path #: ', mesh.json().paths.length, ', uri:', mesh.uri());

        // - begin routing
        mesh.router(true);
        mesh.discover(true);
        mesh.accept = function(inc) {
            console.log('--> incoming from', {"hashname": inc.hashname, "paths": inc.paths});
            // - establishes link from any incoming req
            var link = mesh.link(inc);
            console.log('--> link established', inc.hashname)

            // - cb for link status changes
            link.on();

        }
        // - then bootstrap the server
        bootstrap(mesh);
    });
    return mesh;
};

var mesh = function() {
    var id = _id(_router);
}();

