/* global angular, _, Backbone, PouchDB, $, emit */

// - data exchange shim; used for communicating across dtou instances
// - meant to be pluggable with other data exchange backends, not just thjs
angular.module('dtouprism')
    .factory('dataLayer', function(utils, thdata, $http) {
        var DEBUG   = utils.debug(),
            media   = {
                telehash: 'telehash'
            },
            types   = {
                tweet:  'tweet'
            },
            headers = {
                'content-type': 'application/json'
            },
            // - TODO make this configurable, e.g. using webrtc instead
            medium = media.telehash;

        var utils = {
            getAcls: function(local) {
                // - RPC to node app to get acls using a simple http call
                // - must include location of node ctr (local)
                return new Promise(function(resolve, reject) {
                    var out = new URL(local);
                    out.pathname = 'dtou/roles';
                    $http({
                        method: 'GET',
                        url: out.href,
                        headers: headers,
                    }).then(function (resp) {
                        console.info('>> roles received', resp.data);
                        resolve(resp.data);
                    }, function (e) {
                        console.error('>> failed to retrieve roles', e);
                        resolve((e.data) ? e.data : {error:'check configurations'});
                    });
                });
            },
            setAcls: function(local, acls) {
                // - similar to above but for setting acls
                return new Promise(function(resolve, reject) {
                    console.info('setting acl', acls);
                    var out = new URL(local);
                    out.pathname = 'dtou/roles';
                    $http({
                        method: 'POST',
                        url: out.href,
                        headers: headers,
                        data: acls
                    }).then(function (resp) {
                        console.info('>> roles updated', resp.data);
                        resolve(resp.data);
                    }, function (e) {
                        console.error('>> failed to update roles', e);
                        resolve((e.data) ? e.data : {error:'check configurations'});
                    });
                });
            },
            deleteAcls: function(local, acls) {
                // - and likewise for delete
                return new Promise(function(resolve, reject) {
                    var out = new URL(local);
                    out.pathname = 'dtou/roles';
                    $http({
                        method: 'DELETE',
                        url: out.href,
                        headers: headers,
                        data: acls
                    }).then(function (resp) {
                        console.info('>> roles deleted', resp.data);
                        resolve(resp.data);
                    }, function (e) {
                        console.error('>> failed to delete roles', e);
                        resolve((e.data) ? e.data : {error:'check configurations'});
                    });
                });
            }
        };

        // - extend basic functionality with thjs backend
        if (medium === media.telehash){
            return _.extend(utils, {
                init: function(payload) {
                    // - for pre-connecting to a thjs router on start up
                    return thdata.connect(payload.local, payload.endpoint).catch(function(e){
                        console.warn('dataLayer init failure', e);
                    });
                },
                extract: function(payload) {
                    // - front a call to the telehash layer to find tokens
                    if(!payload.type) console.error('tried to extract without type', payload);
                    else if(payload.type === types.tweet){
                        return thdata.extractFromText(payload.text);
                    }
                },
                id: function(local) {
                    // - for getting user ids (in this case thjs hashnames)
                    return thdata.id(local);
                },
                askPeer: thdata.askPeer,
                token: thdata.token
            });
        }
        else throw new Error('dtou medium not implemented');
    });
