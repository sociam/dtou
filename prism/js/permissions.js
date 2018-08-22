/* globals _, chrome, angular, extension */

console.log('hello --- permissions!');

var app = angular.module('dtouprism');

app.config(['$compileProvider', ($compileProvider) => {
    // - later versions of angular will blacklist the chrome-extension scheme
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|local|data|chrome-extension):/);
}]);

app.controller('permissions', ($scope, utils, $location, $timeout) => {
    // - this module uses similar tricks to create.js and other.js
    var bg = chrome.extension.getBackgroundPage(),
        url = $location.absUrl(),
        oid = utils.getUrlParam(url, 'id'),
        ui = $scope.ui = {},
        loadResourceUsers = () => {
            // - for assigned roles to this resource, get associated users/resources
            ui.resources = _.uniqBy(_.flatMap(ui.chosen, (acl) => {return acl.resources}));
            ui.identifiers = _.uniqBy(_.flatMap(ui.chosen, (acl) => {return acl.identifiers}));
        },
        loadAcls = () => {
            return bg.getAcls().then((acls) => {
                ui.acls = acls;
                // - these are for the user-role attachment ui
                // - ui.identifier is the peer's token; acl.identifiers are all assigned identifiers
                ui.chosen = acls.filter((acl) => {return acl.identifiers && acl.identifiers.includes(ui.identifier)});
                ui.unchosen = acls.filter((acl) => {return !acl.identifiers || !acl.identifiers.includes(ui.identifier)});
                loadResourceUsers();

                // - these are for the role-dtou modification ui
                ui.currentRole = acls.find((acl) => {return acl.identifiers && acl.identifiers.includes(ui.identifier)});
                ui.dtou = ui.currentRole ? ui.currentRole.dtou : {};

                // - if we're not still loading unset the flag
                ui.loading = false;
                ui.loadingLong = false;
            });
        },
        makeOnClicks = () => {
            $timeout(() => {
                // - necessary as chrome extensions dont work with bootstrap <a>s
                ['modify', 'assign'].map((item) => {
                    $('#'+item).on('click', () => {
                        $('.nav-link').removeClass('active');
                        $('.tab-pane').removeClass('show').removeClass('active');
                        $('#'+item).addClass('active');
                        $('#'+item+'-roles').addClass('show').addClass('active');
                    });
                });

                // - options for assigning roles (multi-select)
                let assignedList = $('#assign-role-list');
                let chosenIds = ui.chosen.map((acl) => {return acl._id});
                ui.acls.map((acl) => {
                    let opt = $('<option>'+acl._id+'</option>');
                    if(chosenIds.includes(acl._id)) opt.attr('selected', 'selected');
                    opt.appendTo(assignedList);
                });
                // - when the assigned role list changes, update backend vars
                assignedList.on('change', () => {
                    $timeout(() => {
                        let newIds = assignedList.val() ? assignedList.val() : [];
                        ui.chosen = ui.acls.filter((acl) => {return newIds.includes(acl._id)});
                        ui.unchosen = ui.acls.filter((acl) => {return !newIds.includes(acl._id)});
                        loadResourceUsers();
                    });
                });

                // - buttons for modifying roles, will open panel w/ dtous for current role
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
                // - make a button for adding new roles; TODO
                // makeButton({_id:'+ Create New Role',dtou:{}});
            });
        };

    $scope.$l = $location;
    ui.loading = true;
    ui.loadingLong = false;

    $timeout(() => {
        ui.loadingLong = ui.loading;
    }, 10000);

    $scope.serialise = (s) => JSON.stringify(s);
    bg.getCollectionWrapped('items').then((collection) => {
        console.log(`got collection ${collection.models.length}, ${oid}, ${url}`);
        $timeout(() => {
            // - gets the resources for roles
            $scope.items = collection.models;
            if (oid) {
                let m = collection.get(oid);
                if(m){
                    ui.author = m.attributes.author;
                    ui.type = m.attributes.type;
                    ui.identifier = bg.extract(m.attributes);
                }
                if(ui.identifier) {
                    // - if we're looking at a peer (i.e. ui.identifier is defined), load acls
                    loadAcls().then(makeOnClicks);
                } else {
                    ui.loading = false;
                    ui.loadingLong = false;
                }
            }
        });
        $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        return collection;
    });

    $scope.save = () => {
        if ($scope.ui && ui.currentRole) {
            // - this saves the DTOU for a selected role
            bg.setAcls([ui.currentRole]).then(() => {
                $timeout(() => {
                    window.location.reload();
                }, 200);
            });
        }
    };

    $scope.assign = () => {
        // - this modifies which roles this user has (backend will limit users to 1 role only)
        if($scope.ui && ui.chosen) {
            var userAdded = ui.chosen.map((role) => {
                // - roles that previously had the user we're removing
                role.identifiers = Array.from(new Set(role.identifiers).add(ui.identifier));
                return role;
            });
            var userRemoved = ui.unchosen.map((role) => {
                // - roles that didn't have the user we're adding
                role.identifiers = role.identifiers.filter((id) => {return id !== ui.identifier});
                return role;
            });
            bg.setAcls(userAdded).then(() => {
                return bg.setAcls(userRemoved);
            }).then(() => {
                $timeout(() => {
                    window.location.reload();
                }, 200);
            });
        }
    };

    $scope.delete = () => {
        // - TODO
    };

    window._s = $scope;

});