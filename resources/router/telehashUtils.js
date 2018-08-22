// - cfg is the router config; linkCache is json file of cached link
// - if TH_CACHE in env is anything but true then ignore cfg and linkCache
// - if TH_DISCOVER is true then thjs will look for other connections in the
//   same network (udp multicast)
// - TH_PRECONNECT can be the url of a publicly-available dtou router; this
//   will make this instance connect to the router on start
const telehash      = require('telehash'),
    fs              = require('fs'),
    http            = require('http'),
    url             = require('url'),
    cs              = require('concat-stream'),
    es              = require('event-stream'),
    _               = require('lodash'),
    cfgFile         = '/mnt/dtou/th_router.json',
    linkFile        = '/mnt/dtou/th_links.json',
    cacheFlag       = process.env.TH_CACHE == 'true',
    discoverFlag    = process.env.TH_DISCOVER == 'true'
    preconnect      = process.env.TH_PRECONNECT;

telehash.log({debug:console.log});

function TelehashException(msg, wrapped, status) {
    var e = Error.call(this, (wrapped) ? (msg, wrapped.message) : msg);
    e.name = "Telehash Exception";
    e.details = wrapped;
    e.status = status ? status : 500;
    return e;
}

var _TelehashUtil = function(reqHandler) {

    // - central mesh obj
    var mesh = null;
    // - DTOU-specific router location
    var dtouRouter = null;

    // - link status cb
    var _linkStatus = function(status, link) {
        console.log('--> [link]', link.hashname, 'status:', (status) ? status : 'established');
        // - close connections cleanly
        if(status === 'all pipes are down') {
            console.log('--> [link]', link.hashname, 'closing');
            link.close();
        }
    }

    // - cache generated endpoint identifier + private keys, then retrieve (TH_CACHE=true)
    // - if running the docker container, use `docker run -v ~/.dtou:/mnt/dtou` for example
    var _id = function () {
        return new Promise(function (resolve, reject) {
            if(fs.existsSync(cfgFile) && cacheFlag) {
                try {
                    var loaded = JSON.parse(fs.readFileSync(cfgFile));
                    console.log('--> cfg loaded (hashname):', loaded.hashname);
                    resolve(loaded);
                } catch (e) {
                    reject(new TelehashException("cfg loading failed", e));
                }
            } else {
                // - if not cached, generate hashname and private keys
                telehash.generate(function (e, generated) {
                    if (e) reject(new TelehashException("router endpoint generation failed", e));
                    console.log('--> id generated (hashname):', generated.hashname);
                    if(cacheFlag) {
                        fs.writeFile(cfgFile, JSON.stringify(generated, null, 4), function(e){
                            reject(new TelehashException("cfg writing failed", e));
                        });
                    }
                    resolve(generated);
                });
            }
        });
    };

    // - helper function to retrieve active links
    var _links = function() {
        if(mesh){
            return mesh.links.map(function(link, index){
                return link.json;
            }).filter(function(link) {
                return link.hashname != mesh.hashname;
            });
        }
        return {};
    }

    // - we use thtp to communicate json payloads
    // - this method builds proxies with a DTOU event handler (takes JSON)
    var _thtpProxyGen = function(reqHandler) {
        try {
            return http.createServer(function(req, resp) {
                if (req.method == 'POST') {
                    // - uses concat-stream to simplify stream handling
                    req.pipe(cs(function(body) {
                        var payload = JSON.parse(body.toString());
                        console.info('<-- [thtp] incoming request', payload);
                        resp.setHeader('Content-Type', 'application/json');
                        if(reqHandler && typeof reqHandler === 'function') {
                            reqHandler(payload, req.hashname).then(function(out){
                                console.info('--> [thtp] handler finished, sending out', out);
                                resp.end(JSON.stringify(out));
                            });
                        } else {
                            resp.end(JSON.stringify({}));
                        }
                    }));
                }
            });
        } catch(e) {
            console.log('--> [thtp] proxy failure', e);
        }
    }

    // - experimental: use stream extension to communicate json
    var _streamHandlerGen = function(reqHandler) {
        return function(link, req, accept) {
            accept().pipe(es.writeArray(function(e, items){
                console.log('--> [stream] from ', link.hashname, ' received ', items);
                if(reqHandler && typeof reqHandler === 'function') {
                    var out = reqHandler(items, req.hashname);
                }
            }));
        }
    }

    // - bring up a routing mesh on this instance
    var _router = function(endpoint, reqHandler) {
        // - create mesh; block on the promise if needed
        return new Promise(function(resolve, reject) {
            if(mesh) return resolve(mesh);

            // - cache links in a volume... TODO fix this, doesn't work
            var links = [];

            telehash.mesh({id: endpoint, links: links}, function (e, created) {
                if (e) reject(new TelehashException("mesh generation failed", e));
                console.log('--> mesh created:', JSON.stringify(created.json(), null, 2));

                // - begin routing
                created.router(true);
                created.discover(discoverFlag);

                // - accept any link
                created.accept = function (inc) {
                    console.info('<-- incoming link from', inc.hashname);
                    // - establishes link from any incoming req
                    var link = created.link(inc);

                    // - cb for in-link status changes
                    link.status(_linkStatus);
                };

                // - sync meshed links to cache file
                created.linked(function(json, str) {
                    if(json.length > 0 && cacheFlag) {
                        console.log("--> caching links: ", json.map(function(x){
                            return x.hashname;
                        }).join());
                        fs.writeFile(linkFile, str, function (e) {
                            if(e) console.error("links caching failed", e);
                        });
                    }
                });

                // - hook up our custom dtou handlers for thtp and streams
                created.proxy(_thtpProxyGen(reqHandler));
                created.stream(_streamHandlerGen(reqHandler));

                // - return ready mesh
                mesh = created;
                resolve(created);
            });
        });
    };

    // - manually connect to an endpoint
    // - if endpoint's a plain string mesh.link will treat as a hashname; will require a router
    // - else it must be of the form  {
    //     "hashname":
    //     "keys": {
    //       "1a": ,
    //       "2a": ,
    //       "3a":
    //     },
    //     "paths": [
    //     ]
    //   }
    var _connect = function(endpoint) {
        return new Promise(function(resolve, reject) {
            // - somehow telehash decides _not_ to use the cached links
            var found = mesh.links.filter(function(l){
                return (l.hashname === endpoint.hashname || l.hashname === endpoint) && l.up;
            });
            if(found.length > 0) {
                console.info('--> found cached link for', found[0].hashname);
                return resolve(found[0]);
            }
            var link = mesh.link(endpoint);

            // - TODO fix this -- significantly faster but buggy
            // - race two promises to get connection w/ 10s timeout
            // return Promise.race([
            Promise.race([
                new Promise(function(resolve, reject){
                    setTimeout(function(){
                        reject(new TelehashException("failed to link to endpoint ["+JSON.stringify(endpoint)+"] (not found?)"), null, 404);
                    }, 10000);
                }),
                new Promise(function(resolve, reject) {
                    var interval = setInterval(function() {
                        if(link && link.up) {
                            // - cb for out-link status changes
                            link.status(_linkStatus);
                            resolve(link);
                            clearInterval(interval);
                        }
                    }, 200);
                })
            ]);

            // - hold for 10s; replace with above when fixed
            setTimeout(function(){
                if(link && link.up) {
                    // - cb for out-link status changes
                    link.status(_linkStatus);
                    return resolve(link);
                }
                reject(new TelehashException("failed to link to endpoint ["+JSON.stringify(endpoint)+"] (not found?)"), null, 404);
            }, 10000);
        })
    }

    // - send a payload via stream
    var _outStream = function(payload, endpoint, respHandler) {
        return new Promise(function(resolve, reject) {
            _connect(endpoint).then(function(link) {

                console.log('--> [stream] outgoing');
                var outStream = link.stream()
                var streamed = es.readArray([payload]).pipe(outStream);
                streamed.on('error',function(e) {
                    console.log('--> [stream] failed', e);
                });
                if(respHandler && typeof respHandler === 'function'){
                    streamed = respHandler(streamed);
                }
                resolve(streamed);
            }).catch(function(e) {
                if(e instanceof TelehashException) {
                    return reject(e);
                }
                reject(new TelehashException('pre-stream connection failure', e));
            });
        })
    }

    // - send a payload via thtp
    var _outThtp = function(payload, endpoint, respHandler) {
        return new Promise(function(resolve, reject) {
            _connect(endpoint).then(function(link) {
                console.log('--> [thtp] outgoing to', endpoint);
                const ops = {
                    method: 'POST',
                    path:   '/'
                }
                const req = link.request(ops, function(resp) {
                    // - concat-stream used again to handle incoming responses
                    resp.pipe(cs(function(body) {
                        var payload = JSON.parse(body.toString());
                        console.log('<-- [thtp] incoming response', payload);
                        if(respHandler && typeof respHandler === 'function') {
                            payload = respHandler(payload);
                        }
                        resolve(payload);
                    }));
                });
                req.on('error', function(e) {
                    reject(new TelehashException('egress thtp request failed', e));
                });
                req.end(JSON.stringify(payload));
            }).catch(function(e) {
                if (e instanceof TelehashException) {
                    return reject(e);
                }
                reject(new TelehashException('pre-fire connection failure', e));
            });
        })
    }

    // - point this instance to a bootstrapping DTOU router
    // - necessary when peers are behind NATs, and also when their full path info
    //   is not available (i.e. we only have a hashname)
    var _bootstrap = function(addr) {
        return new Promise(function(resolve, reject) {
            // - first, get router hints from the addr (via the node endpoint, not thjs)
            var opts = {
                host: addr,
                path: '/telehash/router'
            };
            var req = http.request(opts, function(resp) {
                resp.pipe(cs(function(body) {
                    var payload = JSON.parse(body.toString());
                    if(!payload.mesh){
                        console.log(payload);
                        reject(new TelehashException('malformed router info', {}));
                    }
                    console.log('--> DTOU router located', payload.mesh.hashname);
                    resolve(payload.mesh);
                }));
            });
            req.on('error', function(e) {
                reject(new TelehashException("failed to link to endpoint (not found?)"), e, 404);
            });
            req.end();
        }).then(function(endpoint){
            // - need to update hints if router is also NATed
            var mapped = endpoint.paths.map(function(path) {
                if (path.ip) {
                    path.ip = addr;
                }
                if (path.url) {
                    var parsed = url.parse(path.url);
                    path.url = parsed.protocol + '://' + addr + ':' + parsed.port + '/';
                }
                return path;
            });
            endpoint.paths = mapped;
            return _connect(endpoint);
        });

    }

    // - init promise will load hashname & pathing, start the mesh, and preconnect
    return new Promise(function(resolve, reject) {
        _id().then(function(id) {
            return _router(id, reqHandler);
        }).then(function(mesh) {
            if (preconnect) {
                console.info('--> preconnecting to', preconnect);
                return _bootstrap(url.parse(preconnect).hostname).then(function (router) {
                    return mesh;
                }).catch(function(e){
                    console.error('could not preconnect to', preconnect);
                    return mesh;
                });
            }
            return Promise.resolve(mesh);
        }).then(function(mesh) {
            // - export utility functions specific to this instance
            resolve({
                bootstrap: _bootstrap,
                connect: _connect,
                links: _links,
                mesh: mesh,
                fire: function (payload, endpoint, respHandler) {
                    if (payload.stream) return _outStream(payload, endpoint, respHandler);
                    return _outThtp(payload, endpoint, respHandler);
                }
            });
        });
    });
};

module.exports = {
    TelehashException : function(msg, wrapped) {
        return TelehashException(msg, wrapped);
    },
    instance: function(reqHandler) {
        return _TelehashUtil(reqHandler);
    }
}