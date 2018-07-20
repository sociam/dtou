/* globals _, chrome, angular, extension */

console.log('hello --- permissions!');

var app = angular.module('dtouprism');

app.config(['$compileProvider', function ($compileProvider) {
    // - later versions of angular will blacklist the chrome-extension scheme
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension):/);
}]);

app.controller('permissions', function($scope, utils, $location, $timeout) {
    var bg = chrome.extension.getBackgroundPage(),
        url = $location.absUrl(),
        oid = utils.getUrlParam(url, 'id'),
        ui = $scope.ui = {},
        loadResourceUsers = () => {
            ui.resources = _.uniqBy(_.flatMap(ui.chosen, (acl) => {return acl.resources}));
            ui.users = _.uniqBy(_.flatMap(ui.chosen, (acl) => {return acl.resources}));
        },
        loadAcls = () => {
            bg.getAcls().then((acls) => {
                $timeout(() => {
                    ui.acls = acls;

                    // - these are for the use-role attachment ui
                    ui.chosen = acls.filter((acl) => {return acl.users.includes(ui.identifier)});
                    ui.unchosen = acls.filter((acl) => {return !acl.users.includes(ui.identifier)});
                    loadResourceUsers();

                    // - these are for the role-modification ui
                    ui.currentAcl = acls.find((acl) => {return acl.users.includes(ui.identifier)});
                    ui.dtou = ui.currentAcl.dtou;

                    // - if we're still loading unset the flag
                    ui.loading = false;
                    ui.loadingLong = false;
                    makeOnClicks();
                });
            });
        },
        makeOnClicks = () => {
            // - a massive waste of time but necessary until i figure out
            //   why chrome extensions dont work with bootstrap <a>s
            ['modify', 'assign'].map((item) => {
                $('#'+item).on('click', function() {
                    $('.nav-link').removeClass('active');
                    $('.tab-pane').removeClass('show').removeClass('active');
                    $('#'+item).addClass('active');
                    $('#'+item+'-roles').addClass('show').addClass('active');
                });
            });

            // - options for assigning roles
            let assignedList = $('#assign-role-list');
            let chosenIds = ui.chosen.map((acl) => {return acl._id});
            ui.acls.map((acl) => {
                let opt = $('<option>'+acl._id+'</option>');
                if(chosenIds.includes(acl._id)) opt.attr('selected', 'selected');
                opt.appendTo(assignedList);
            });
            assignedList.on('change', () => {
                let newIds = assignedList.val();
                ui.chosen = ui.acls.filter((acl) => {return newIds.includes(acl._id)});
                ui.unchosen = ui.acls.filter((acl) => {return !newIds.includes(acl._id)});
                loadResourceUsers();
                $scope.$apply();
            })

            // - buttons for modifying roles
            let aclList = $('#acl-role-list');
            ui.acls.map((acl) => {
                let btn = $('<button class="list-group-item list-group-item-action">'+acl._id+'</button>');
                if(ui.currentAcl._id.includes(acl._id)) btn.addClass('active');
                btn.on('click', () => {
                    $('.list-group-item').removeClass('active');
                    btn.addClass('active');
                    ui.currentAcl = acl;
                    ui.dtou = acl.dtou;
                    console.info('dtou', ui.dtou);
                    $scope.$apply();
                    return true;
                }).appendTo(aclList);
            });
        };

    $scope.$l = $location;
    ui.loading = true;
    ui.loadingLong = false;

    $timeout(function(){
        ui.loadingLong = ui.loading;
    }, 10000);

    $scope.serialise = (s) => JSON.stringify(s);
    bg.getCollectionWrapped('items').then((collection) => {
        console.log(`got collection ${collection.models.length}, ${oid}, ${url}`);
        $timeout(() => {
            $scope.items = collection.models;
            if (oid) {
                let m = collection.get(oid);
                if(m){
                    ui.author = m.attributes.author;
                    ui.type = m.attributes.type;
                    ui.identifier = bg.extract(m.attributes);
                }
                if(ui.identifier) {
                    loadAcls();
                } else {
                    ui.loading = false;
                    ui.loadingLong = false;
                }
                // console.log("selected >> ", $scope.selected);
            }
        });
        $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        return collection;
    });

    // - TODO: remove when I find out why nav tabs don't work in chrome extensions

    $scope.save = () => {
        if ($scope.selected && $scope.ui) {
            var m = $scope.selected,
                attr = m.attributes,
                ui = $scope.ui;

            $scope.selected.save().then(() => {
                $timeout(function() {
                    window.close();
                }, 200);
            });
        }
    };
    window._s = $scope;

});