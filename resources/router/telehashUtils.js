// - cfg is the router config; linkCache is json file of cached link
// - if TH_CACHE in env is anything but true then ignore cfg and linkCache
// - use `docker run -e "TH_CACHE=true"`
const telehash  = require('telehash'),
    fs          = require('fs'),
    cfgFile         = '/mnt/dtou/th_router.json',
    linkFile   = '/mnt/dtou/th_links.json',
    cacheFlag   = process.env.TH_CACHE == 'true';

var mesh = null;

function TelehashException(msg, wrapped) {
    var e = Error.call(this, (wrapped) ? (msg, wrapped.message) : msg);
    e.name = "Telehash Exception";
    e.details = wrapped;
    e.status = 500;
    return e;
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

// - router init
var _router = function (endpoint) {
    // - create mesh; block on the promise if needed
    return new Promise(function (resolve, reject) {
        if(mesh) return resolve(mesh);

        // - cache links in a volume
        var links = (fs.existsSync(linkFile) && cacheFlag) ? require(linkFile) : [];

        telehash.mesh({id: endpoint, links: links}, function (e, created) {
            if (e) reject(new TelehashException("mesh generation failed", e));
            console.log('--> mesh created. path #: ', created.json().paths.length, ', uri:', created.uri());

            // - begin routing
            created.router(true);
            created.discover(true);

            // - accept any link
            created.accept = function (inc) {
                console.log('--> incoming from', {"hashname": inc.hashname, "paths": inc.paths});
                // - establishes link from any incoming req
                var link = created.link(inc);

                // - cb for link status changes
                link.status(function(status, link) {
                    console.log('--> [link]', link.hashname, 'status:', (status) ? status : 'established');
                    // - i dont like this anymore than you...
                    if(status === 'all pipes are down') {
                        console.log('--> [link]', link.hashname, 'closing');
                        link.close();
                    }
                });
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
            // - return ready mesh
            mesh = created;
            resolve(created);
        });
    });
};

var _connect = function(endpoint) {
    var link = mesh.link(endpoint);
}


// - handler for shutdowns; cleanly close links
var _handler = function(sig) {
    if(mesh) {
        console.log('--> [EXIT]', sig);
        console.log('--> closing all links: ', mesh.links.map(function(x) {
            x.close();
            return x.hashname;
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
    TelehashException : function(msg, wrapped) {
        return TelehashException(msg, wrapped);
    }
}