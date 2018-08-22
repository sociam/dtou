/* globals _, chrome, angular, extension */


var app = angular.module('dtouprism');

app.controller('explore', function($scope, storage, utils, $timeout) {
	var bg = chrome.extension.getBackgroundPage();

	$scope.serialise = (s) => JSON.stringify(s);

	bg.getCollectionWrapped('items').then((collection) => {
		console.log(`got collection ${collection.models.length}`);
		$timeout(() => {$scope.items = collection.models; });
		$scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
	});

	window._s = $scope;
});

app.config(['$compileProvider', function ($compileProvider) {
    // - later versions of angular will blacklist the chrome-extension scheme
    $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension):/);
}]);