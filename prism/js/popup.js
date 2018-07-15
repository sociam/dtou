/* globals angular, _, chrome */

var app = angular.module('dtouprism', []);

app.controller('popup', ($scope, $timeout) => {
	var bg = chrome.extension.getBackgroundPage();

    bg.getConf().then(function(res){
        $scope.dtou_ctr = res.dtou_ctr;
        $scope.dtou_router = res.dtou_router;
        $scope.dtou_storage = res.storage_location;
    });

	chrome.storage.onChanged.addListener(function(changes, namespace) {
        for (key in changes) {
            if (key === 'dtouprism_conf'){
                var updated = changes[key];
                $scope.dtou_ctr = updated.newValue.dtou_ctr;
                $scope.dtou_router = updated.newValue.dtou_router;
                $scope.dtou_storage = updated.newVale.storage_location;
            }
        }
    });

    $scope.openKnapsack = () => {
        chrome.tabs.create({url:"explore.html"});
    }

    $scope.save = () => {
        bg.setConf({
            dtou_ctr: $scope.dtou_ctr,
            dtou_router: $scope.dtou_router,
            storage_location: $scope.dtou_storage
		});
        window.close();
    };

    $timeout(() => {
        $scope.enabled = bg.getEnabledContentPages();
        $scope.$watchCollection('enabled', (x, old, z) => {
            _.keys(x).map((k) => {
                if (old[k] !== x[k]) {
                    page.setEnableContentPage(k, x[k]);
                }
            });
        });
    }, 0);
});

app.config(['$compileProvider', function ($compileProvider) {
	// - later versions of angular will blacklist the chrome-extension scheme
    $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension):/);
}]);