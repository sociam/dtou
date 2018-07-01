/* global angular, _, Backbone, PouchDB, $, emit */

// data exchange shim; used for communicating across dtou instances -- LM

angular.module('dtouprism')
    .factory('data', function(remote, utils, $http) {
        var DEBUG = utils.debug();
        var ctr = utils.dtou_ctr();
        var router = utils.dtou_router();

        // -
        var forward = function(payload, options){
            if (payload.telehash) {
                return new Promise(function(resolve, reject) {
                    opts = {

                    }
                });
            }
        }
        return {

        };
    });
