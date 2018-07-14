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

            var endpointToIdentifier = function(endpoint) {
                if(!endpoint.mesh.hashname) return 'ERROR --> check console';
                return token + ' ' + endpoint.mesh.hashname;
            };

            var id = function(local) {
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

            var getDefinitions = function(local, endpoint, router, payload) {
                return new Promise(function(resolve, reject) {
                    var out = new URL(local);
                    out.pathname = 'dtou/definitions';
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
                        console.info('>> dtou def resp received', resp.data);
                        resolve(resp.data);
                    }, function (e) {
                        console.error('>> failed to get dtou defs', e);
                        resolve((e.data) ? e.data : {error:'check configurations'});
                    });
                });
            };

            var extractFromText = function(text) {
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
                getDefinitions: getDefinitions
            };
        });
})();
