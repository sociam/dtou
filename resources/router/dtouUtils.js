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
// - for now we're not using anything additional to read permissions
var getAllRoleNames = function() {
        return storageUtils.getAll(roledbName).then(function(roles) {
            return roles.map(function(role) {return role._id});
        })
    },
    getRolesToDtou = function(roleNames) {
        return storageUtils.getAll(roledbName).then(function(roles) {
            // - we do one big getAll and then filter instead of Promise.all -- more performant
            var chosen = roles.filter(function(role){return !roleNames || roleNames.includes(role._id)})
                .map(function(role){return role._id});
            var merged = roles;
            return getRolesToResources(chosen).then(function(roles2) {
                // - this part is just a tricky way of merging two separate lists of roles:dtou and roles:resources
                merged = merged.map(function(role){
                    var found = roles2.find(function(r){return r.role === role._id});
                    return _.merge(role, {resources:found ? Object.keys(found.resources) : []});
                });
                return getRolesToUsers(chosen);
            }).then(function(roles2){
                // - and then merging roles:users
                merged = merged.map(function(role){
                    var found = roles2.find(function(r){return r.role === role._id});
                    return _.merge(role, {users:found ? found.users : []});
                });
                return merged;
            });
        });
    },
    getRolesToResources = function(roles) {
        return storageUtils.db(acldbName).then(function(db) {
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
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(roles.map(function(role){
                return acl.roleUsers(role).then(function(out) {
                    return {role:role, users:out};
                })
            }))
        })
    },
    setRolesToDtou = function(roles, dtou) {
        return Promise.all(roles.map(function(role) {
            return storageUtils.update(roledbName, role, function(prev){
                if(!prev || !prev.dtou) return {dtou:dtou};
                return {dtou:_.merge(prev.dtou, dtou)};
            });
        })).then(function(got) {
            return got;
        });
    },
    addRolesToResources = function(roles, resources) {
        return storageUtils.db(acldbName).then(function(db){
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(roles.map(function(role) {
                return acl.allow(role, resources, defaultPerms);
            })).then(function(out) {
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
    addRolesToUsers = function(roles, users) {
        return storageUtils.db(acldbName).then(function(db) {
            let acl = new Acl(new Acl.pouchdbBackend(db, acldbName));
            return Promise.all(users.map(function(user) {
                return acl.addUserRoles(user, roles);
            })).then(function(out) {
                return out;
            });
        });
    },
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
        // - A selects dtous + ask for further operations on B's data wrt dtous
        if(!blob.type) throw new DtouException('dtou blob missing field: type');
        if(blob.cmd) console.warn('dtou blob already had field: cmd', blob);
        if(blob.type === dtouTypes.tweet){
            var slim = _.omit(blob, ['text', 'html', 'conversationId']);
            if (!blob.agreement || Object.keys(blob.agreement).length === 0){
                return Promise.resolve(_.merge(slim, {cmd: commands.get_defs}));
            }
            return Promise.resolve(_.merge(slim, {cmd: commands.process_dtous}));
        }
    },
    _inboundCheckDtou = function(blob) {
        // - B processes incoming request for dtou definitions from A, send them out
        if(blob.type === dtouTypes.tweet) {
            if(!blob.id) throw new DtouException('blob missing field: id');
            return storageUtils.get(defaultdbName, blob.id).then(function(got){
                if(got.dtou) got.dtou.secrets = {};
                return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
            }).catch(function(e) {
                console.error(e);
                return {error: e.message};
            });
        }
    },
    _inboundProcessDtou = function(blob, dtou_identifier) {
        // - B releases data
        // - TODO all DTOU logic will go here, e.g. future project: DTOU spec lang
        if(blob.type === dtouTypes.tweet) {
            if(!blob.id) throw new DtouException('blob missing field: id');
            return storageUtils.get(defaultdbName, blob.id).then(function(got){
                var myDtou = got.dtou,
                    theirAgreement = blob.agreement,
                    consumer = blob.agreement.consumer,
                    newSecrets = _.cloneDeep(myDtou.secrets);
                    myDtou.secrets = {};
                if(!myDtou || !theirAgreement.definitions.substitute){
                    // - if reader hasn't agreed to my dtous, send out the empty secrets
                    return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                } else {
                    // - otherwise, modify according to my secrets
                    if (newSecrets.substituteHtml){
                        myDtou.secrets.substituteHtml = newSecrets.substituteHtml;
                    }
                    // - if pingback and delete, check if incoming request for data consumption reaches limit
                    var c = _.get(newSecrets, ['pingbackData', dtou_identifier, 'count'], 0),
                        d = _.get(myDtou, ['definitions', 'delete'], 0),
                        limitReached = myDtou.definitions.pingback && myDtou.definitions.delete && c > d;
                    if(limitReached){
                        myDtou.secrets.substituteHtml = '<i>Read-limit reached; content removed.</i>';
                    }
                    // - otherwise, modify my secrets
                    else if (myDtou.definitions.pingback){
                        var now = new Date();
                        // - this whole blob is to 1. init the previous time if it doesn't exist;
                        //   2. update values if readtime*minutes has passed since then
                        _.update(newSecrets, ['pingbackData', dtou_identifier, 'stamp'], function(prev){
                            if(!prev) return now;
                            if(myDtou.definitions.readtime){
                                var stamp = new Date(prev);
                                stamp.setMinutes(stamp.getMinutes() + myDtou.definitions.readtime);
                                if(stamp.getTime() < now.getTime()) {
                                    _.set(newSecrets, ['pingbackData', dtou_identifier, 'count'], c+1);
                                    return now;
                                }
                            }
                            return prev;
                        });
                        _.set(newSecrets, ['pingbackData', dtou_identifier, 'author'], _.get(consumer, ['twitter', 'author']));
                        _.set(newSecrets, ['pingbackData', dtou_identifier, 'authorid'], _.get(consumer, ['twitter', 'authorid']));
                    }
                    // - ensure that we've updated our own secrets first before releasing outgoing data
                    return storageUtils.update(defaultdbName, blob.id, function(item){
                        item.dtou.secrets = newSecrets;
                        return item;
                    }).then(function(){
                        console.info('--> [DTOU] updated dtou for', blob.id, newSecrets);
                        return _.pick(got, ['_id', '_rev', 'dtou', 'cmd']);
                    });
                }
            }).catch(function(e) {
                console.error(e);
                return {error: e.message};
            });
        }
    },
    inboundController = function(blob, dtou_identifier) {
        // - redirects all inbound messages to the right places
        try {
            if (blob.cmd === commands.get_defs) {
                return _inboundCheckDtou(blob);
            } else if (blob.cmd === commands.process_dtous) {
                return _inboundProcessDtou(blob, dtou_identifier);
            } else {
                throw new DtouException('blob has weird cmd block', blob);
            }
        } catch(e) {
            console.error('--> [DTOU] inbound dtou controller error: ', e);
            return Promise.resolve({error: e});
        }
    };

module.exports = {
    getRolesToDtou: getRolesToDtou,
    getRoleToResource: getRolesToResources,
    getRolesToUsers: getRolesToUsers,
    setRolesToDtou: setRolesToDtou,
    addRolesToResources: addRolesToResources,
    getUserToRoles: getUserToRoles,
    addRolesToUsers: addRolesToUsers,
    outboundProcessDtou: outboundProcessDtou,
    inboundController: inboundController
}