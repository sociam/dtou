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
            ui.identifiers = _.uniqBy(_.flatMap(ui.chosen, (acl) => {return acl.identifiers}));
        },
        loadAcls = () => {
            return bg.getAcls().then((acls) => {
                ui.acls = acls;
                // - these are for the use-role attachment ui
                ui.chosen = acls.filter((acl) => {return acl.identifiers && acl.identifiers.includes(ui.identifier)});
                ui.unchosen = acls.filter((acl) => {return !acl.identifiers || !acl.identifiers.includes(ui.identifier)});
                loadResourceUsers();

                // - these are for the role-modification ui
                ui.currentRole = acls.find((acl) => {return acl.identifiers && acl.identifiers.includes(ui.identifier)});
                ui.dtou = ui.currentRole ? ui.currentRole.dtou : {};

                // - if we're still loading unset the flag
                ui.loading = false;
                ui.loadingLong = false;
            });
        },
        makeOnClicks = () => {
            $timeout(() => {
                // - TODO a massive waste of time but necessary until i figure out
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
                    $timeout(() => {
                        let newIds = assignedList.val();
                        ui.chosen = ui.acls.filter((acl) => {return newIds.includes(acl._id)});
                        ui.unchosen = ui.acls.filter((acl) => {return !newIds.includes(acl._id)});
                        loadResourceUsers();
                    });
                });

                // - buttons for modifying roles
                let aclList = $('#acl-role-list');
                let makeButton = (acl) => {
                    let btn = $('<button class="list-group-item list-group-item-action">'+acl._id+'</button>');
                    if(ui.currentRole._id.includes(acl._id)) btn.addClass('active');
                    btn.on('click', () => {
                        $timeout(()=>{
                            $('.list-group-item').removeClass('active');
                            btn.addClass('active');
                            ui.currentRole = acl;
                            ui.dtou = acl.dtou;
                            return true;
                        })
                    }).appendTo(aclList);
                }
                ui.acls.map(makeButton);
                // - make a button for adding new roles
                // makeButton({_id:'+ Create New Role',dtou:{}});
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
                    loadAcls().then(makeOnClicks);
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

    $scope.save = () => {
        if ($scope.ui && ui.currentRole) {
            bg.setAcls([ui.currentRole]).then(() => {
                $timeout(function() {
                    window.location.reload();
                }, 200);
            });
        }
    };

    $scope.assign = () => {
        if($scope.ui && ui.chosen) {
            var userAdded = ui.chosen.map((role) => {
                role.identifiers = Array.from(new Set(role.identifiers).add(ui.identifier));
                return role;
            });
            var userRemoved = ui.unchosen.map((role) => {
                role.identifiers = role.identifiers.filter((id) => {return id !== ui.identifier});
                return role;
            });
            bg.setAcls(userAdded).then(() => {
                return bg.setAcls(userRemoved);
            }).then(() => {
                $timeout(function() {
                    window.location.reload();
                }, 200);
            });
        }
    };

    $scope.delete = () => {

    };

    window._s = $scope;

});