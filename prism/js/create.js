/* globals _, chrome, angular, extension */

console.log('hello --- create!');

angular.module('dtouprism')
    .controller('create', function($scope, storage, utils, $location, $timeout, $sce) {
        var bg = chrome.extension.getBackgroundPage(),
            url = $location.absUrl(),
            oid = utils.getUrlParam(url, 'id'),
            ui = $scope.ui = {};

        $scope.$l = $location;
        ui.loading = true;
        ui.loadingLong = false;

        $timeout(function(){
            ui.loadingLong = ui.loading;
        }, 10000);

        $scope.serialise = (s) => JSON.stringify(s);
        bg.getCollectionWrapped('items', {force:true}).then((collection) => {
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
                        ui.disclaimer = dtou.definitions.disclaimer;
                        ui.disclaimerHtml = dtou.definitions.disclaimerHtml;
                        ui.pingback = dtou.definitions.pingback;
                        ui.pingbackData = dtou.secrets.pingbackData;
                        ui.delete = dtou.definitions.delete;
                        ui.readtime = (dtou.definitions.readtime >= 0) ? dtou.definitions.readtime : 0;
                        ui.sign = dtou.definitions.sign;
                    };
                    // console.log("selected >> ", $scope.selected);
                }
                ui.loading = false;
                ui.loadingLong = false;
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
                dtou.definitions.disclaimer = ui.disclaimer;

                if (ui.substitute) dtou.secrets.substituteHtml = ui.substituteHtml;
                if (ui.disclaimer) dtou.definitions.disclaimerHtml = ui.disclaimerHtml;
                if (ui.pingback) dtou.secrets.pingbackData = (dtou.secrets.pingbackData) ? dtou.secrets.pingbackData : {};
                if (ui.sign) {
                    // TODO - implement crypto
                }
                m.set('dtou', dtou);
                $scope.selected.save().then(() => {
                    console.log(`model updated ${m.id}`, dtou);
                    $timeout(function() {
                        window.close();
                    }, 200);
                });
            }
        };
        window._s = $scope;

    });