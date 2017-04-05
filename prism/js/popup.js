/* globals angular, _, chrome */

angular.module('popup', [])
	.controller('main', ($scope, $timeout) => {
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