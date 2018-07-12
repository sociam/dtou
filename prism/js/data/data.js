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
            medium = media.telehash;

        var utils = {
            extract: function(payload) {
                if(!payload.type) console.error('tried to extract without type', payload);
                else if(payload.type === types.tweet){
                    return thdata.extractFromText(payload.text);
                }
            }
        };

        if (medium === media.telehash){
            return _.extend(utils, {
                id: function(local) {
                    return thdata.id(local);
                },
                getDefinitions: thdata.getDefinitions,
                token: thdata.token
            });
        }
        else throw new Error('dtou medium not implemented');
    });
