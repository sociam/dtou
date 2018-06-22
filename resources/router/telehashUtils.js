// - cfg is the router config; linkCache is json file of cached link
// - if TH_CACHE in env is anything but true then ignore cfg and linkCache
// - use `docker run -e "TH_CACHE=true"`
const telehash      = require('telehash'),
    fs              = require('fs'),
    http            = require('http'),
    cs              = require('concat-stream'),
    es              = require('event-stream'),
    cfgFile         = '/mnt/dtou/th_router.json',
    linkFile        = '/mnt/dtou/th_links.json',
    cacheFlag       = process.env.TH_CACHE == 'true',
    discoverFlag    = process.env.TH_DISCOVER == 'true';

telehash.log({debug:console.log});

var mesh = null;

function TelehashException(msg, wrapped, status) {
    var e = Error.call(this, (wrapped) ? (msg, wrapped.message) : msg);
    e.name = "Telehash Exception";
    e.details = wrapped;
    e.status = status ? status : 500;
    return e;
}

// - link status cb
var _linkStatus = function(status, link) {
    console.log('--> [link]', link.hashname, 'status:', (status) ? status : 'established');
    // - i dont like this anymore than you...
    if(!link.up || status === 'all pipes are down') {
        console.log('--> [link]', link.hashname, 'closing');
        link.close();
    }
}

// - cache generated endpoint identifier & retrieve (activate with TH_CACHE=true)
// - if running the docker container, use `docker run -v ~/.dtou:/mnt/dtou` for example
var _id = function () {
    return new Promise(function (resolve, reject) {
        if(fs.existsSync(cfgFile) && cacheFlag) {
            try{
                var loaded = JSON.parse(fs.readFileSync(cfgFile));
                console.log('--> cfg loaded (hashname):', loaded.hashname);
                resolve(loaded);
            } catch(e){
                reject(new TelehashException("cfg loading failed", e));
            }
        }
        else {
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

// - use thtp to communicate json payloads
// - build proxies with a DTOU event handler (must take a JSON payload)
var _thtpProxyGen = function(dtouHandler) {
    try {
        return http.createServer(function(req, resp) {
            if (req.method == 'POST') {
                req.pipe(cs(function(body) {
                    var payload = JSON.parse(body.toString());
                    console.log('--> [thtp] incoming request', payload);
                    resp.setHeader('Content-Type', 'application/json');
                    var out = {}
                    if(dtouHandler && typeof dtouHandler == 'function') {
                        out = dtouHandler(payload);
                    }
                    // resp.write(JSON.stringify(out))
                    resp.end(JSON.stringify(out));
                }));
            }
        });
    } catch(e) {
        console.log('--> [thtp] proxy failure', e);
    }
}

// - use stream extension to communicate json
var _streamHandlerGen = function(dtouHandler) {
    return function(link, req, accept) {
        accept().pipe(es.writeArray(function(e, items){
            console.log('--> [stream] from ', link.hashname, ' received ', items);
            if(dtouHandler && typeof dtouHandler == 'function') {
                var out = dtouHandler(items);
            }
        }));
    }
}

// - router init
var _router = function(endpoint, dtouHandler) {
    // - create mesh; block on the promise if needed
    return new Promise(function(resolve, reject) {
        if(mesh) return resolve(mesh);

        // - cache links in a volume
        var links = (fs.existsSync(linkFile) && cacheFlag) ? require(linkFile) : [];

        telehash.mesh({id: endpoint, links: links}, function (e, created) {
            if (e) reject(new TelehashException("mesh generation failed", e));
            // console.log('--> mesh created. path #: ', created.json().paths.length, ', uri:', created.uri());
            console.log('--> mesh created:', JSON.stringify(created.json(), null, 2));

            // - begin routing
            created.router(true);
            created.discover(discoverFlag);

            // - accept any link
            created.accept = function (inc) {
                // console.log('--> incoming from', {"hashname": inc.hashname, "paths": inc.paths});
                console.log('--> incoming from', inc);
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
                    })
                }
            });

            // - hook up our custom dtou handlers for thtp and streams
            created.proxy(_thtpProxyGen(dtouHandler));
            created.stream(_streamHandlerGen(dtouHandler));

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
        var link = mesh.link(endpoint);
        // - hold for 3s
        setTimeout(function(){
            if(link && link.up) {
                // - cb for out-link status changes
                link.status(_linkStatus);
                return resolve(link);
            }
            reject(new TelehashException("failed to link to endpoint (not found?)"), null, 404);
        }, 3000);
    })
}

// - send a payload via stream
var _outStream = function(payload, endpoint, dtouHandler) {
    return new Promise(function(resolve, reject) {
        _connect(endpoint).then(function(link) {

            console.log('--> [stream] outgoing');
            var outStream = link.stream()
            var streamed = es.readArray([payload]).pipe(outStream);
            streamed.on('error',function(e) {
               console.log('--> [stream] failed', e);
            });
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
var _outThtp = function(payload, endpoint, dtouHandler) {
    return new Promise(function(resolve, reject) {
        _connect(endpoint).then(function(link) {
            console.log('--> [thtp] outgoing');
            const ops = {
                method: 'POST',
                path:   '/'
            }
            const req = link.request(ops, function(resp) {
                resp.pipe(cs(function(body) {
                    var payload = JSON.parse(body.toString());
                    console.log('--> [thtp] incoming response', payload);
                    var out = {}
                    if(dtouHandler && typeof dtouHandler == 'function') {
                        out = dtouHandler(payload);
                    }
                    resolve(out);
                }));
            });
            req.on('error', function(e) {
                reject(new TelehashException('egress thtp request failed', e));
            });
            // req.write(JSON.stringify({payload}));
            req.end(JSON.stringify(payload));
        }).catch(function(e) {
            if (e instanceof TelehashException) {
                return reject(e)
            }
            reject(new TelehashException('pre-fire connection failure', e));
        });
    })
}

// - handler for shutdowns; cleanly close links
var _handler = function(sig) {
    if(mesh) {
        console.log('--> [EXIT]', sig);
        console.log('--> closing all links: ', mesh.links.map(function(l) {
            l.close();
            return l.hashname;
        }).join());
    }
    process.exit();
}

process.on('exit', _handler.bind(null, 'exit'));
// process.on('SIGINT', _handler.bind(null, 'SIGINT'));
// process.on('SIGUSR1', _handler.bind(null, 'SIGUSR1'));
// process.on('SIGUSR2', _handler.bind(null, 'SIGUSR2'));

module.exports = {
    id: function() {
        return _id();
    },
    router: function(endpoint) {
        return _router(endpoint);
    },
    connect: function(endpoint) {
        return _connect(endpoint);
    },
    fire: function(payload, endpoint, dtouHandler) {
        if (payload.thtp) return _outThtp(payload, endpoint, dtouHandler);
        return _outStream(payload, endpoint, dtouHandler);
    },
    TelehashException : function(msg, wrapped) {
        return TelehashException(msg, wrapped);
    }
}