/* globals _, chrome, angular, extension */

console.log('hello --- create!');

angular.module('dtouprism')
    .controller('other', function($scope, storage, utils, $location, $timeout, $sce) {
        console.info('hello other');
        var bg = chrome.extension.getBackgroundPage(),
            url = $location.absUrl(),
            oid = utils.getUrlParam(url, 'id'),
            ui = $scope.ui = {};


        $scope.$l = $location;

        $scope.serialise = (s) => JSON.stringify(s);
        bg.getCollectionWrapped('items').then((collection) => {
            console.log(`got collection ${collection.models.length}, ${oid}, ${url}`);
            $timeout(() => {
                $scope.items = collection.models;
                if (oid) {
                    var m = $scope.selected = collection.get(oid);
                    $scope.selectedHtml = $sce.trustAsHtml($scope.selected.attributes.html || $scope.selected.attributes.text);
                    if(m.attributes.dtou){
                        var dtou = m.attributes.dtou;
                        ui.substitute = dtou.definitions.substitute;
                        ui.substituteHtml = dtou.secrets.substituteHtml;
                        ui.pingback = dtou.definitions.pingback;
                        ui.pingbackData = dtou.secrets.pingbackData;
                        ui.sign = dtou.definitions.sign;
                    };
                    // console.log("selected >> ", $scope.selected);
                }
            });
            $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        });

        $scope.save = () => {
            if ($scope.selected && $scope.ui) {
                var m = $scope.selected,
                    attr = m.attributes,
                    dtou = attr.dtou || {
                        definitions: {},
                        secrets:    {}
                    },
                    ui = $scope.ui;

                if (ui.substitute) {
                    dtou.definitions.substitute = true;
                    dtou.secrets.substituteHtml = ui.substituteHtml;
                }

                if (ui.pingback) {
                    dtou.definitions.pingback = true;
                    dtou.secrets.pingbackData = (dtou.secrets.pingbackData) ? dtou.secrets.pingbackData : {};
                }

                if (ui.sign) {
                    // TODO - implement crypto
                    dtou.definitions.sign = true;
                }
                m.set('dtou', dtou);
                $scope.selected.save().then(() => { console.log(`model updated ${m.id}`, dtou);});
            }
        };
        window._s = $scope;

    });