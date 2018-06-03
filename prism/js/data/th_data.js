// - communication layer using telehash
// - TODO remove chai, mocha, blueimp, fastclick, underscore from bower.json

(function () {
    angular.module('dtouprism')
        .factory('th_data', function(utils) {

            var DEBUG = utils.debug();
            if (DEBUG) {
                telehash.debug(function(){console.log.apply(console,arguments)});
            }

            // - cache generated endpoint identifier & retrieve
            // - TODO move this elsewhere as chrome storage isn't encrypted
            var _id = chrome.storage.local.get(["th_id"], function(loaded){
                if(!loaded.th_id) {
                    telehash.generate(function (err, generated) {
                        if(e) {
                            return console.log("--> endpoint generation failed", e);
                        }
                        chrome.storage.local.set({"th_id": generated});
                        loaded.th_id = generated;
                    })
                }
                return loaded.th_id;
            });

            // - initialise mesh w/ our endpoint
            // - TODO we're routing everything for now
            var _mesh = telehash.mesh({id: id}, function(e, created){
                if(e) {
                    return console.log("--> mesh failed to initialize", e);
                }
                console.log('--> mesh created. path #: ', created.json().paths.length, ', uri:', created.uri());

                // - use this mesh as a router for inbound links (accept all)
                created.router(true);
                created.discover(true);
                created.accept = function(inc) {
                    console.log('--> incoming from', inc.hashname);
                    // - establishes link from any incoming req
                    var link = created.link(inc);
                }
            });

            // - given another endpoint, create an outbound link in this mesh with a router
            var _connect = function(endpoint) {
                var link = mesh.link(endpoint)
                // - note following callback is invoked when link status changes; err if down
                link.status(function(err){
                    if(err) {
                        console.log('--> disconnected from endpoint', endpoint ,err);
                        // - TODO attempt to connect directly
                        return;
                    }
                    console.log('--> connected to endpoint', endpoint);
                });
            }

            // - singleton
            return {
            }
        });
})();
