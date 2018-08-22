// - communication layer using telehash
// - TODO remove chai, mocha, blueimp, fastclick, underscore from bower.json

(function () {
    angular.module('dtouprism')
        .factory('thdata', function(utils, $http) {
            var DEBUG   = utils.debug(),
                token   = 'dtou-thjs',
                headers = {
                    'content-type': 'application/json'
                };

            // - the identifier injected into tweets is <token> <hashname> (e.g. dtou-thjs asdfq2e12...)
            var endpointToIdentifier = function(endpoint) {
                if(!endpoint.mesh.hashname) return 'ERROR --> check console';
                return token + ' ' + endpoint.mesh.hashname;
            };

            var id = function(local) {
                // - to get our hashname call the node js router info endpoint
                return new Promise(function(resolve, reject){
                   var out = new URL(local);
                   out.pathname = 'telehash/router';
                   $http({
                       method: 'GET',
                       url: out.href
                   }).then(function(resp) {
                       resolve(endpointToIdentifier(resp.data));
                   }, function(e) {
                       console.warn('>> failed to get thjs id', e)
                       resolve(endpointToIdentifier({}));
                   });
                });
            };

            var connect = function(local, endpoint) {
                // - connect to a different thjs endpoint (find it e.g. using an injected token)
                return new Promise(function (resolve, reject) {
                    var out = new URL(local);
                    out.pathname = 'telehash/connect';
                    $http({
                        method: 'POST',
                        url: out.href,
                        headers: headers,
                        data: {
                            endpoint: endpoint
                        }
                    }).then(function (resp) {
                        console.info('>> remote DTOU router connected', resp.data.link.hashname);
                        resolve(resp.data);
                    }, function (e) {
                        console.error('>> failed to connect to endpoint', e);
                        resolve((e.data) ? e.data : {error:'check configurations'});
                    });
                });
            };

            var fire = function(local, endpoint, payload) {
                // - send arbitrary info to another user via thjs
                return new Promise(function (resolve, reject) {
                    var out = new URL(local);
                    out.pathname = 'telehash/data';
                    $http({
                        method: 'POST',
                        url: out.href,
                        headers: headers,
                        data: {
                            endpoint: endpoint,
                            payload: payload
                        }
                    }).then(function (resp) {
                        console.info('>> thtp payload sent', resp.data);
                        resolve(resp.data);
                    }, function (e) {
                        reject(e);
                    });
                });
            };

            var askPeer = function(local, endpoint, router, payload) {
                // - call the main thjs + rbac endpoint that handles all dtou communications
                // - requires local (node ctr url), endpoint (remote hashname),
                //   router (thjs router url), and the payload we are sending
                return new Promise(function(resolve, reject) {
                    var out = new URL(local);
                    out.pathname = 'dtou/ask_peer';
                    $http({
                        method: 'POST',
                        url: out.href,
                        headers: headers,
                        data: {
                            endpoint: endpoint,
                            payload: payload,
                            router: router
                        }
                    }).then(function (resp) {
                        console.info('>> dtou resp received', resp.data);
                        resolve(resp.data);
                    }, function (e) {
                        console.error('>> failed to ask peer', e);
                        resolve((e.data) ? e.data : {error:'check configurations'});
                    });
                });
            };

            var extractFromText = function(text) {
                // - get a hashname out of a text chunk
                var split = text.split(/\s+/);
                var hn = split[split.indexOf(token) + 1];
                if (hn.length != 52) console.warn('>> might have found a weird hash', hn);
                return hn
            };

            return {
                // - tell local dtou router to connect to remote endpoint
                connect: function(local, endpoint) {
                    console.info('>> connecting to remote DTOU router', endpoint);
                    return connect(local, endpoint);
                },
                // - establish connection sandwiching a proxy router
                proxied: function(local, router, endpoint){
                    console.info('>> connecting to remote DTOU router (proxied)');
                    return connect(local, router).then(function(res){
                        return connect(local, endpoint);
                    });
                },
                token: token,
                id: id,
                extractFromText: extractFromText,
                askPeer: askPeer
            };
        });
})();
