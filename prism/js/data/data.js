/* global angular, _, Backbone, PouchDB, $, emit */

// data exchange shim; used for communicating across dtou instances -- LM

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
            medium = media.telehash;

        var utils = {
            extract: function(payload) {
                if(!payload.type) console.error('tried to extract without type', payload);
                else if(payload.type === types.tweet){
                    return thdata.extractFromText(payload.text);
                }
            },
            getAcls: function(local) {
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
            }
        };

        if (medium === media.telehash){
            return _.extend(utils, {
                init: function(payload) {
                    return thdata.connect(payload.local, payload.endpoint).catch(function(e){
                        console.warn('dataLayer init failure', e);
                    });
                },
                id: function(local) {
                    return thdata.id(local);
                },
                askPeer: thdata.askPeer,
                token: thdata.token
            });
        }
        else throw new Error('dtou medium not implemented');
    });
