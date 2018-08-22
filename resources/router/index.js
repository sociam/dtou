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

    _telehashRouter.route('/connect')
        // - connect to another telehash endpoint
        .post(function(req, resp, next) {
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

    _telehashRouter.route('/data')
        // - send arbitrary data across thjs connections
        .post(function(req, resp, next) {
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

    _dtouRouter.route('/ask_peer')
        // - method that fronts all dtou logic before communicating over thjs
        // - payload uses same data model as stored in pdb for convenience
        .post(function(req, resp, next) {
            console.log('--> post /dtou/ask_peer', req.body);
            if(!req.body.endpoint) return next(new BadRequestException("POST /dtou/ask_peer missing field: endpoint", {}));
            // - figure out which request to send (get dtou or get content)
            dtouUtils.outboundProcessDtou(req.body.payload).then(function(updated) {
                // - then fire it out using thjs
                return thUtils.fire(updated, req.body.endpoint);
            }).then(function(out){
                resp.send(out);
            }).catch(function(e) {
                return next(e);
            });
        });

    _dtouRouter.route('/roles')
        // - get role --> dtou mappings
        .get(function(req, resp, next) {
            console.log('--> get /dtou/roles');
            dtouUtils.getRolesToDtou().then(function(got) {
                resp.send(got);
            }).catch(function(e) {
                return next(e);
            });
        })
        .post(function(req, resp, next) {
            // - helper function to wrap an http call per acl update across dtou, users (identifiers), and resources
            // - computationally expensive! not meant for frequent updates
            // - TODO will need to make this a transaction
            console.log('--> post /dtou/roles', req.body);
            var update = function(roles, dtou, resources, identifiers) {
                return dtouUtils.getRolesToDtou().then(function(allRoles){
                    // - figure out which existing roles we're trying to update
                    var filtered = allRoles.filter(function(x) {return roles.includes(x._id);}),
                        existingResources = _.flatten(filtered.map(function(r){return r.resources})),
                        existingUsersToRoles = {};
                    filtered.map(function(role) {
                        // - figure out whether users have already been assigned to these roles
                        role.identifiers.map(function(id) {
                            if (!existingUsersToRoles[id]) existingUsersToRoles[id] = [];
                            existingUsersToRoles[id].push(role._id);
                        })
                    });
                    // - sequentially update mappings: role --> dtou, role --> resources, users --> roles
                    return dtouUtils.setRolesToDtou(roles, dtou ? dtou : {}).then(function(got) {
                        return dtouUtils.setRolesToResources(roles, resources ? resources : [], existingResources);
                    }).then(function() {
                        return dtouUtils.setUsersToRoles(identifiers ? identifiers : [], roles, existingUsersToRoles);
                    }).then(function(){
                        // - sanity check to validate updated roles
                        return dtouUtils.getRolesToDtou();
                    }).then(function(newRoles){
                        return newRoles.filter(function(x) {return roles.includes(x._id)});
                    })
                });
            };
            // - allows either: 1. shorthand (one dtou for multiple roles, multiple users, multiple resources), or
            //                  2. long description (list of separate role definitions/assignments)
            if(req.body.roles){
                update(req.body.roles, req.body.dtou, req.body.resources, req.body.identifiers).then(function(res){
                    console.info('--- role:identifiers & role:resources mapping deleted', res);
                    return resp.send(res);
                });
            } else if(req.body) {
                Promise.all(req.body.map(function(role){
                    return update([role._id], role.dtou, role.resources, role.identifiers);
                })).then(function(res){
                    var updated = _.flatten(res);
                    console.info('--- role:identifiers & role:resources mapping updated', updated);
                    return resp.send(_.flatten(updated));
                }).catch(function(e){
                    console.error(e);
                    return {error:e.message};
                });
            } else {
                return next(new BadRequestException('POST /dtou/roles missing body', {}));
            }
        })
        .delete(function(req, resp, next) {
            console.log('--> delete /dtou/roles');
            // - again, allows either 1. shorthand for mass deletion, or 2. separate role definitions for deletion
            if(req.body.roles){
                dtouUtils.getRolesToDtou(req.body.roles).then(function(got) {
                    return dtouUtils.deleteRoles(got);
                }).then(function(res) {
                    console.info('--- role:identifiers & role:resources mapping deleted', res);
                    return resp.send(res);
                });
            } else {
                dtouUtils.deleteRoles(req.body).then(function(res){
                    console.info('--- role:identifiers & role:resources mapping deleted', res);
                    return resp.send(res);
                });
            }
        });

    return _dtouRouter;
}


// - cb for actually running the app
// - if running the docker container, use docker run -p 8080:3000 or docker-compose (see docker dir)
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
            resp.status(400).send({"error": e.message, "details": e.details})
        });

        // - listen to the default port
        app.listen(port, function(e) {
            if (e) throw e;
            console.log('--> dtou router available on port', port);
        });
    });
};

bootstrap();
