/* globals angular, _, chrome */

var app = angular.module('popup', []);

app.controller('main', ($scope, $timeout) => {
		chrome.runtime.getBackgroundPage((page) => {
			$timeout(() => {
				$scope.enabled = page.getEnabledContentPages();
				$scope.$watchCollection('enabled', (x, old, z) => {
					_.keys(x).map((k) => {
						if (old[k] !== x[k]) {
							page.setEnableContentPage(k, x[k]);
						}
					});
				});
			}, 0);
		});

		$scope.openKnapsack = () => {
			chrome.tabs.create({url:"explore.html"});
		};

	});

app.config(['$compileProvider', function ($compileProvider) {
	// - later versions of angular will blacklist the chrome-extension scheme
    $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension):/);
}]);