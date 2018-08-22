const storageUtils  = require('./storageUtils'),
    _               = require('lodash'),
    Acl             = require('node_acl_pouchdb'),
    defaultdbName   = 'items',
    roledbName      = 'roles',
    acldbName       = 'acl',
    defaultPerms    = ['read']
    commands        = {
        get_defs: 'get_defs',
        process_dtous: 'process_dtous'
    },
    dtouTypes       = {
        tweet:  'tweet'
    };

function DtouException(msg, wrapped, status) {
    var e = Error.call(this, (wrapped) ? (msg, wrapped.message) : msg);
    e.name = "DTOU Exception";
    e.details = wrapped;
    e.status = status ? status : 500;
    return e;
}

// - acls (they're actually more of an rbac in this instance) for 3 mappings:
//   roles --> dtous, handled with simple custom logic
//   roles --> resources (items/<id>; simple r access) and roles --> users (thjs hn), handled with node_acl_pouchdb
var getAllRoleNames = function() {
        return storageUtils.getAll(roledbName).then(function(roles) {
            return roles.map(function(role) {return role._id});
        })
    },
    getRolesToDtou = function(roleNames) {
        return storageUtils.getAll(roledbName).then(function(roles) {
            // - we do one big getAll and then filter instead of Promise.all -- more performant
            var chosen = roles.filter(function(role){return !roleNames || roleNames.includes(role._id)});
            var chosenNames = chosen.map(function(role){return role._id});
            var merged = chosen;
            return getRolesToResources(chosenNames).then(function(roles2) {
                // - this part is just a tricky way of merging two separate lists of roles:dtou and roles:resources
                merged = merged.map(function(role){
                    var found = roles2.find(function(r){return r.role === role._id});
                    return _.merge(role, {resources:found ? Object.keys(found.resources) : []});
                });
                return getRolesToUsers(chosenNames);
            }).then(function(roles2){
                // - and then merging roles:users
                merged = merged.map(function(role){
                    var found = roles2.find(function(r){return r.role === role._id});
                    return _.merge(role, {identifiers:found ? found.identifiers : []});
                });
                return merged;
            });
        });
    },
    getRolesToResources = function(roles) {
        return storageUtils.db(acldbName).then(function(db) {
            // - moderately straightforward: get resources to which roles have access
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(roles.map(function(role){
                return acl.whatResources(role).then(function(out){
                    return {role:role, resources:out};
                });
            }));
        });
    },
    getRolesToUsers = function(roles) {
        return storageUtils.db(acldbName).then(function(db) {
            // - similarly get users to which roles are attached
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(roles.map(function(role){
                return acl.roleUsers(role).then(function(out) {
                    return {role:role, identifiers:out};
                })
            }))
        })
    },
    setRolesToDtou = function(roles, dtou) {
        return Promise.all(roles.map(function(role) {
            return storageUtils.update(roledbName, role, function(prev){
                // - overwrite by default instead of merging; easier for deletions
                // if(!prev || !prev.dtou) return {dtou:dtou};
                // return {dtou:_.merge(prev.dtou, dtou)};
                return {dtou:dtou};
            });
        })).then(function(got) {
            return got;
        });
    },
    setRolesToResources = function(roles, resources, existing) {
        // - TODO: prone to race conditions (should be ok if user sets rbac serially); need to make this a transaction
        // - two-phased acl updater; add new resources to roles and remove pre-existing resources that are not included
        return storageUtils.db(acldbName).then(function(db){
            // - find diff, i.e. resources to be added + removed
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName)),
                toAdd = resources.filter(function(resource){return !existing || !existing.includes(resource)}),
                toRemove = existing ? existing.filter(function(resource) {return !resources.includes(resource)}) : [];
            // - should not cause a problem w/ parallel promises (allow/removeAllow operate on separate cdb docs)
            return Promise.all(roles.map(function(role) {
                console.info('-- adding resources', role, toAdd, [role]);
                return toAdd.length > 0 ? acl.allow(role, toAdd, [role]) : [];
            })).then(function(){
                return Promise.all(roles.map(function(role) {
                    console.info('-- removing resources', role, toRemove, [role]);
                    return toRemove.length > 0 ? acl.removeAllow(role, toRemove, [role]) : [];
                }));
            }).then(function(out) {
                return out;
            });
        });
    },
    getUserToRoles = function(id) {
        return storageUtils.db(acldbName).then(function(db) {
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return acl.userRoles(id);
        });
    },
    setUsersToRoles = function(newIdentifiers, newRoles, existingMap) {
        // - TODO: make this a transaction too
        // - same as setRolesToResources but for users; add new users and remove pre-existing, non-specified users
        return storageUtils.db(acldbName).then(function(db) {
            var acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(newIdentifiers.map(function(identifier) {
                return acl.addUserRoles(identifier, newRoles);
            })).then(function(out){
                return Promise.all(Object.entries(existingMap).map(function([oldIdentifier, oldRoles]){
                    let toRemove = oldRoles.filter(function(oldRole) {
                        // - this returns true iff we are modifying a role in newRoles, and that role
                        //   is no longer assigned to its old identifier :. remove the assignment
                        return newRoles.includes(oldRole) && !newIdentifiers.includes(oldIdentifier);
                    });
                    return acl.removeUserRoles(oldIdentifier, toRemove);
                }));
            }).then(function(out) {
                return out;
            });
        });
    },
    getUserResourcePermissions = function(id, resources){
        return storageUtils.db(acldbName).then(function(db) {
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return acl.allowedPermissions(id, resources);
        });
    },
    deleteRoles = function(roleDocs) {
        // - TODO: this also has to become a transaction
        console.info(roleDocs);
        var filtered = roleDocs.filter(function(doc){return !doc._id || !doc._rev});
        if(filtered.length != 0) throw new DtouException('role deletion requires _id and _rev');
        return storageUtils.db(acldbName).then(function(db) {
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(roleDocs.map(function(doc){
                console.info('--- remove role', doc._id);
                return acl.removeRole(doc._id);
            }));
        }).then(function(res) {
            return Promise.all(roleDocs.map(function(doc) {
                storageUtils.delete(roledbName, doc);
            }));
        }).then(function(res){
            console.info('--- deletion completed', res);
            return roleDocs;
        }).catch(function(e){
            console.error(e);
            return {error: e.message};
        });
    },
    // - helper function for resolving roles by folding them against the default dtou
    // - if dtous are integrated with a policy lang this would be way more sophisticated
    _resolveRoles = function(content, roleNames){
        var empty = !roleNames || roleNames.length == 0;
        if(!content.dtou.definitions.defaultToNone && empty){
            return Promise.resolve({accept:true, id:content._id, dtou:content.dtou, db:defaultdbName});
        } else if (content.dtou.definitions.defaultToNone && empty){
            return Promise.resolve({accept:false, id:content._id, dtou:content.dtou, db:defaultdbName});
        } else if (!content.dtou.definitions.useRoleDtou) {
            return Promise.resolve({accept:true, id:content._id, dtou:content.dtou, db:defaultdbName});
        } else if (roleNames.length == 1){
            console.info('--- role permissions found', roleNames[0]);
            return getRolesToDtou(roleNames).then(function(res){
                return {accept:true, id:roleNames[0], dtou:res[0].dtou, db:roledbName};
            });
        } else {
            console.warn('--- multi-role resolution not supported yet');
            return Promise.resolve({accept:true, id:content._id, dtou:content.dtou, db:defaultdbName});
        }
    },
    // - handlers used to process DTOUs on incoming/outgoing communication
    // - uses a pipe-filter model
    handlers = {
        _substituteHandler: {
            inbound: function(data) {},
            outbound: function(data) {}
        },
        _pingbackHandler: {
            inbound: function(data) {},
            outbound: function(data) {}
        }
    },
    outboundProcessDtou = function(blob) {
        // - method that figures out whether we're asking for dtous or hidden content
        // - A selects dtous + ask for further operations on B's data wrt dtous
        if(!blob.type) throw new DtouException('dtou blob missing field: type');
        if(blob.cmd) console.warn('dtou blob already had field: cmd', blob);
        if(blob.type === dtouTypes.tweet){
            var slim = _.omit(blob, ['text', 'html', 'conversationId']);
            // - if we haven't agreed to one already, ask for a dtou
            if (!blob.agreement || Object.keys(blob.agreement).length === 0){
                return Promise.resolve(_.merge(slim, {cmd: commands.get_defs}));
            }
            return Promise.resolve(_.merge(slim, {cmd: commands.process_dtous}));
        }
    },
    _inboundCheckDtou = function(myContent, dtouIdentifier, theirPermissions) {
        // - this is called in response to requests for releasing dtous, and
        //   figures out which dtou to send out
        if(myContent.type === dtouTypes.tweet) {
            var resolved = _resolveRoles(myContent, theirPermissions[myContent._id]),
                dtou = resolved.dtou,
                contentMerged = _.merge(myContent, dtou);
            console.info('--> resolved dtou check', contentMerged);
            if(contentMerged.dtou) contentMerged.dtou.secrets = {};
            return Promise.resolve(_.pick(contentMerged, ['_id', '_rev', 'dtou', 'cmd']));
        }
    },
    _inboundProcessDtou = function(theirContent, myContent, dtouIdentifier, theirPermissions) {
        // - B releases data, subject to A's agreement and B's dtou
        return _resolveRoles(myContent, theirPermissions[myContent._id]).then(function(resolved) {
            // - accept is false iff dtouIdentifier doesn't have a role and the user specified
            //   unrecognised peers to be automatically rejected
            var accept = resolved.accept,
            // - key for wherever the dtou is stored (could be content-custom, could be role-specific)
            dtouLocation = resolved.id,
            // - where we can find aforementioned dtou
            dtouDb = resolved.db,
            // - actual dtou content
            outboundDtou = resolved.dtou,
            // - their acceptance of my dtou
            theirAgreement = theirContent.agreement,
            // - convenience var for their self-identification as data consumer
            consumer = theirContent.agreement.consumer,
            // - updated secrets i'll write into my dtou
            myNewSecrets = _.cloneDeep(outboundDtou.secrets);
            // - erase outbound dtou's secrets
            outboundDtou.secrets = {};
            if(!accept || !outboundDtou || !theirAgreement.definitions.substitute){
                // - if reader hasn't agreed to my dtous, send out the empty secrets
                return _.pick(_.merge(myContent, outboundDtou), ['_id', '_rev', 'dtou', 'cmd']);
            } else {
                // - otherwise, modify according to my secrets, e.g. insert hidden content
                if (myNewSecrets.substituteHtml){
                    outboundDtou.secrets.substituteHtml = myNewSecrets.substituteHtml;
                }
                // - if pingback and delete, check if incoming request for data consumption reaches limit
                var c = _.get(myNewSecrets, ['pingbackData', dtouIdentifier, 'count'], 0),
                    d = _.get(outboundDtou, ['definitions', 'delete'], 0),
                    limitReached = outboundDtou.definitions.pingback && outboundDtou.definitions.delete && c > d;
                if(limitReached){
                    outboundDtou.secrets.substituteHtml = '<i>Read-limit reached; content removed.</i>';
                }
                // - otherwise, modify by incrementing view count
                else if (outboundDtou.definitions.pingback){
                    var now = new Date();
                    // - this whole blob is to 1. init the previous time if it doesn't exist;
                    //   2. update values if readtime*minutes has passed since then
                    _.update(myNewSecrets, ['pingbackData', dtouIdentifier, 'stamp'], function(prev){
                        if(!prev) return now;
                        if(outboundDtou.definitions.readtime){
                            var stamp = new Date(prev);
                            stamp.setMinutes(stamp.getMinutes() + outboundDtou.definitions.readtime);
                            if(stamp.getTime() < now.getTime()) {
                                _.set(myNewSecrets, ['pingbackData', dtouIdentifier, 'count'], c+1);
                                return now;
                            }
                        }
                        return prev;
                    });
                    // - 3. set the details of the data consumer
                    _.set(myNewSecrets, ['pingbackData', dtouIdentifier, 'author'], _.get(consumer, ['twitter', 'author']));
                    _.set(myNewSecrets, ['pingbackData', dtouIdentifier, 'authorid'], _.get(consumer, ['twitter', 'authorid']));
                }
                // - ensure that we've updated our own secrets first before releasing outgoing data
                return storageUtils.update(dtouDb, dtouLocation, function(item){
                    item.dtou.secrets = myNewSecrets;
                    return item;
                }).then(function(){
                    console.info('--> [DTOU] updated dtou for', theirContent.id, myNewSecrets);
                    return _.pick(_.merge(myContent, outboundDtou), ['_id', '_rev', 'dtou', 'cmd']);
                });
            }
        });
    },
    inboundController = function(blob, dtouIdentifier) {
        if(!blob.id) throw new DtouException('blob missing field: id');
        return Promise.all([
            // - get permissions and the data for the requested content
            getUserResourcePermissions(dtouIdentifier, blob.id),
            storageUtils.get(defaultdbName, blob.id)
        ]).then(function(out) {
            var theirPermissions = out[0],
                myContent = out[1];
            // - redirects all inbound messages to the right places
            if (blob.cmd === commands.get_defs) {
                return _inboundCheckDtou(myContent, dtouIdentifier, theirPermissions);
            } else if (blob.cmd === commands.process_dtous) {
                return _inboundProcessDtou(blob, myContent, dtouIdentifier, theirPermissions);
            } else {
                throw new DtouException('blob has weird cmd block', blob);
            }
        }).catch(function(e) {
            console.error(e);
            return {error: e.message};
        });
    };

module.exports = {
    getRolesToDtou: getRolesToDtou,
    getRoleToResource: getRolesToResources,
    getRolesToUsers: getRolesToUsers,
    setRolesToDtou: setRolesToDtou,
    setRolesToResources: setRolesToResources,
    getUserToRoles: getUserToRoles,
    setUsersToRoles: setUsersToRoles,
    outboundProcessDtou: outboundProcessDtou,
    inboundController: inboundController,
    deleteRoles: deleteRoles
};