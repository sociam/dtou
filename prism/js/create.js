/* globals _, chrome, angular, extension */

console.log('hello --- create!');

angular.module('dtouprism')
    .controller('create', function($scope, storage, utils, $location, $timeout, $sce) {
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
                    ui.author = m.attributes.author;
                    $scope.selectedHtml = $sce.trustAsHtml($scope.selected.attributes.html || $scope.selected.attributes.text);
                    if(m.attributes.dtou){
                        var dtou = m.attributes.dtou;
                        ui.substitute = dtou.definitions.substitute;
                        ui.substituteHtml = dtou.secrets.substituteHtml;
                        ui.pingback = dtou.definitions.pingback;
                        ui.pingbackData = dtou.secrets.pingbackData;
                        ui.delete = dtou.definitions.delete;
                        ui.readtime = (dtou.definitions.readtime >= 0) ? dtou.definitions.readtime : 0;
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

                dtou.definitions.substitute = ui.substitute;
                dtou.definitions.pingback = ui.pingback;
                dtou.definitions.delete = ui.delete;
                dtou.definitions.readtime = ui.readtime;
                dtou.definitions.sign = ui.sign;

                if (ui.substitute) dtou.secrets.substituteHtml = ui.substituteHtml;
                if (ui.pingback) dtou.secrets.pingbackData = (dtou.secrets.pingbackData) ? dtou.secrets.pingbackData : {};
                if (ui.sign) {
                    // TODO - implement crypto
                }
                m.set('dtou', dtou);
                $scope.selected.save().then(() => {
                    console.log(`model updated ${m.id}`, dtou);
                    setTimeout(function() {
                        window.close();
                    }, 200);
                });
            }
        };
        window._s = $scope;

    });