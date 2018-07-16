/* globals _, chrome, angular, extension */

console.log('hello --- other!');

angular.module('dtouprism')
    .controller('other', function($scope, storage, utils, $location, $timeout, $sce) {
        var bg = chrome.extension.getBackgroundPage(),
            url = $location.absUrl(),
            oid = utils.getUrlParam(url, 'id'),
            data = JSON.parse(atob(utils.getUrlParam(url, 'encoded'))),
            ui = $scope.ui = {};

        $scope.$l = $location;

        if(data.dtou && data.dtou.definitions){
            ui.peer = data.dtou.definitions;
        }

        $scope.serialise = (s) => JSON.stringify(s);
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
                            // ui.pingbackData = agreement.secrets.pingbackData;
                            // ui.sign = agreement.definitions.sign;
                        };
                    }
                    // console.log("selected >> ", $scope.selected);
                }
            });
            $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        });

        $scope.save = () => {
            if ($scope.selected && $scope.ui) {
                var m = $scope.selected,
                    attr = m.attributes,
                    agreement = attr.agreement || {
                        definitions: {},
                        secrets:    {}
                    },
                    ui = $scope.ui;

                agreement.definitions.substitute = ui.substitute;
                agreement.definitions.sign = ui.sign;

                if (ui.sign) {
                    // TODO - implement crypto
                }
                m.set('agreement', agreement);
                $scope.selected.save().then(() => {
                    console.log(`model updated ${m.id}`, agreement);
                    setTimeout(function() {
                        window.close();
                    }, 200);
                });
            }
        };
        window._s = $scope;

    });