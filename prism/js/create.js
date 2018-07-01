/* globals _, chrome, angular, extension */

console.log('hello --- create!');

angular.module('dtouprism')
    .controller('create', function($scope, storage, utils, $location, $timeout, $sce) {
        console.log('hello create');
        var bg = chrome.extension.getBackgroundPage(),
            url = $location.absUrl(),
            oid = utils.getUrlParam(url, 'id'),
            ui = $scope.ui = {};


        $scope.$l = $location;

        $scope.serialise = (s) => JSON.stringify(s);
        bg._st.getCollection('items').then((collection) => {
            console.log(`got collection ${collection.models.length}, ${oid}, ${url}`);
            $timeout(() => {
                $scope.items = collection.models; 
                if (oid) { 
                    $scope.selected = collection.get(oid);
                    $scope.selectedHtml = $sce.trustAsHtml($scope.selected.attributes.html || $scope.selected.attributes.text);
                    // console.log("selected >> ", $scope.selected);
                }
            });
            $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        });

        $scope.save = () => { 
            if ($scope.selected && $scope.ui) {
                var m = $scope.selected,
                    attr = m.attributes,
                    dtou = attr.dtou || {},
                    ui = $scope.ui;

                if (ui.substitute) {  
                    dtou.substitute = true;  
                    dtou.substituteHtml = ui.substituteHtml;
                }

                if (ui.pingback) {
                    dtou.pingback = true;
                }

                if (ui.sign) {
                    // TODO - implement crypto
                }
                m.set('dtou', dtou);
                $scope.selected.save().then(() => { console.log(`model updated ${m.id}`, dtou);});
            }
        };
        window._s = $scope;

    });