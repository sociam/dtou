/* globals _, chrome, angular, extension */

console.log('hello --- create!');

angular.module('dtouprism')
    .controller('create', ($scope, storage, utils, $location, $timeout, $sce) => {
        var bg = chrome.extension.getBackgroundPage(),
            url = $location.absUrl(),
            // - this page should be loaded with param containing user's thjs id
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
                    // - these are for the use-role attachment ui (chosen === assigned)
                    ui.chosen = acls.filter((acl) => {return acl.resources && acl.resources.includes(oid)});
                    ui.unchosen = acls.filter((acl) => {return !!acl.resources || !acl.resources.includes(oid)});
                    loadResourceUsers();

                    // - these are for the role-modification ui
                    ui.currentRole = acls.find((acl) => {return acl.resources && acl.resources.includes(oid)});
                    ui.dtou = ui.currentAcl ? ui.currentAcl.dtou : {};
                });
            },
            makeOnClicks = () => {
                $timeout(() => {
                    // - necessary as chrome extensions dont work with bootstrap <a>s
                    ['create', 'assign'].map((item) => {
                        $('#'+item).on('click', () => {
                            $('.nav-link').removeClass('active');
                            $('.tab-pane').removeClass('show').removeClass('active');
                            $('#'+item).addClass('active');
                            $('#'+item+'-dtou').addClass('show').addClass('active');
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
                });
            };

        $scope.$l = $location;

        // - set page to loading state
        ui.loading = true;
        ui.loadingLong = false;

        // - if we're still loading after 10s, show the long loading msg
        $timeout(() => {
            ui.loadingLong = ui.loading;
        }, 10000);

        $scope.serialise = (s) => JSON.stringify(s);
        // - load documents stored in cdb
        bg.getCollectionWrapped('items', {force:true}).then((collection) => {
            console.log(`got collection ${collection.models.length}, ${oid}, ${url}`);
            $timeout(() => {
                $scope.items = collection.models; 
                if (oid) { 
                    var m = $scope.selected = collection.get(oid);
                    ui.author = m.attributes.author;
                    $scope.selectedHtml = $sce.trustAsHtml($scope.selected.attributes.html || $scope.selected.attributes.text);
                    if(m.attributes.dtou){
                        // - bind frontend variables to values from the backend model
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
                        ui.defaultToNone = dtou.definitions.defaultToNone;
                        ui.useRoleDtou = dtou.definitions.useRoleDtou;
                    };
                    loadAcls().then(makeOnClicks);
                    // console.log("selected >> ", $scope.selected);
                    ui.loading = false;
                    ui.loadingLong = false;
                }
            });
            $scope.$watchCollection($scope.items, () => { console.log(' items changed ', $scope.items.length ); });
        });

        // - triggered when UI save button is clicked for dtous
        $scope.save = () => { 
            if ($scope.selected && $scope.ui) {
                // - create or update values in the backend
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
                dtou.definitions.defaultToNone = ui.defaultToNone;
                dtou.definitions.useRoleDtou = ui.useRoleDtou;

                if (ui.substitute) dtou.secrets.substituteHtml = ui.substituteHtml;
                if (ui.disclaimer) dtou.definitions.disclaimerHtml = ui.disclaimerHtml;
                if (ui.pingback) dtou.secrets.pingbackData = (dtou.secrets.pingbackData) ? dtou.secrets.pingbackData : {};
                if (ui.sign) {
                    // TODO - implement crypto
                }
                m.set('dtou', dtou);
                $scope.selected.save().then(() => {
                    console.log(`model updated ${m.id}`, dtou);
                    $timeout(() => {
                        window.location.reload();
                    }, 200);
                });
            }
        };

        // - triggered when roles assigned to a piece of content
        $scope.assign = () => {
            if($scope.ui && ui.chosen) {
                var resourceAdded = ui.chosen.map((role) => {
                    role.resources = Array.from(new Set(role.resources).add(oid));
                    return role;
                });
                var resourceRemoved = ui.unchosen.map((role) => {
                    role.resources = role.resources.filter((id) => {return id !== oid});
                    return role;
                });
                // - call RPC, which will handle logic to add/remove roles to the resource
                bg.setAcls(resourceAdded).then(() => {
                    return bg.setAcls(resourceRemoved);
                }).then(() => {
                    $timeout(() => {
                        window.location.reload();
                    }, 200);
                });
            }
        };

        window._s = $scope;
    });