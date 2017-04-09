/* globals _, chrome, angular, extension */


angular.module('dtouprism').controller('explore', function($scope, storage, utils, $timeout) {
	var bg = chrome.extension.getBackgroundPage();

	$scope.serialise = (s) => JSON.stringify(s);

	bg._st.getCollection('items').then((collection) => {
		console.log(`got collection ${collection.models.length}`);
		$timeout(() => {$scope.items = collection.models; });
		$scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
	});

	window._s = $scope;

});