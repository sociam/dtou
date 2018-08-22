/* globals _, chrome, angular, extension */

console.log('hello --- other!');

angular.module('dtouprism')
    .controller('other', ($scope, utils, $location, $timeout, $sce) => {
        // - this module uses similar tricks to create.js
        // - "other" --> dealing with the DTOUs of others
        var bg = chrome.extension.getBackgroundPage(),
            url = $location.absUrl(),
            oid = utils.getUrlParam(url, 'id'),
            // - parse b64-encoded json param carrying all info gathered from peer's
            //   endpoints, e.g. dtou
            // - this is set when twitter-cs.js opens tab
            data = JSON.parse(atob(utils.getUrlParam(url, 'encoded'))),
            ui = $scope.ui = {};

        $scope.$l = $location;
        ui.loading = true;
        ui.loadingLong = false;

        $timeout(() => {
            ui.loadingLong = ui.loading;
        }, 10000);

        $scope.serialise = (s) => JSON.stringify(s);

        // - load cdb documents using backbone
        // - in create.js we load our own tweets; here we load peers' tweets (public info only)
        //   with our dtou agreement
        bg.getCollectionWrapped('items').then((collection) => {
            console.log(`got collection ${collection.models.length}, ${oid}, ${url}`);
            $timeout(() => {
                $scope.items = collection.models;
                if (oid) {
                    var m = $scope.selected = collection.get(oid);
                    if(m){
                        $scope.selectedHtml = $sce.trustAsHtml($scope.selected.attributes.html || $scope.selected.attributes.text);
                        ui.author = m.attributes.author;
                        if(m.attributes.agreement){
                            var agreement = m.attributes.agreement;
                            ui.substitute = agreement.definitions.substitute;
                            ui.substituteHtml = agreement.secrets.substituteHtml;
                        };
                    }
                }
                // - show peer's terms
                if(data.dtou && data.dtou.definitions){
                    ui.peer = data.dtou.definitions;
                    ui.consumer = data.consumer;
                    ui.loading = false;
                    ui.loadingLong = false;
                }
            });
            $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        });

        // - triggered when the agree button is clicked, i.e. when user agrees to terms
        $scope.save = () => {
            if ($scope.selected && $scope.ui) {
                var m = $scope.selected,
                    attr = m.attributes,
                    agreement = attr.agreement || {
                        definitions: {},
                        secrets:    {}
                    },
                    ui = $scope.ui;

                // - save agreement so twitter-cs.js knows to send agreement out next time
                agreement.definitions.substitute = ui.substitute;
                agreement.definitions.sign = ui.sign;
                agreement.consumer = (ui.consumer) ? ui.consumer : agreement.consumer;

                if (ui.sign) {
                    // TODO - implement crypto
                }
                m.set('agreement', agreement);
                $scope.selected.save().then(() => {
                    console.log(`model updated ${m.id}`, agreement);
                    $timeout(() => {
                        window.close();
                    }, 200);
                });
            }
        };

        window._s = $scope;
    });