/* global angular, _ */
// sync 
//   remote sync logic for storage.js to v2 PInCH Server
(function() { 
	angular.module('dtouprism')
		.factory('storagesync', function($log, storage, remote, utils) {

			var DEBUG = utils.debug(),
				log = $log.instance('storagesync', 'brown');

			if (!DEBUG) { log.disable(); }

			var u = utils,
				definedEqual = function (o1, o2) {
					var o1keys = _.keys(o1).filter(function (k) { return o1[k] !== undefined && o1[k] !== null; }),
						o2keys = _.keys(o2).filter(function (k) { return o2[k] !== undefined && o2[k] !== null; });

					if (o1keys.length !== o2keys.length) { return false; }

					var o1pick = _.pick(o1, o1keys),
						o2pick = _.pick(o2, o2keys);

					return _.isEqual(o1pick, o2pick);
				},
				isForbiddenID = function(mid) {	return mid.indexOf('_design/') === 0; },
				collateCollectionUnvirginModels = function(collection) { 
					// collates all unvirgin models from specified collections
					// updated protocol :: 09.05.2015 
					// now we first check eTag to see if it exists, if so then we proceed
					var pack = function(m, suppressUUID) { 
						var doc = storage.m2d(m, true);
						return {
							data: JSON.stringify(doc),
							collection: m.collection.name,
							id:m.id,
							uuid: !suppressUUID ? m.uuid : undefined,
							encrypted: !!m.encrypted,
							deleted:!!m.deleted,
							isFile:m.file
						};
					};
					return collection.getETag().then(function(etag) { 
						if (etag) { 
							return collection.getNonVirgins().then(function(nvs) { 
								log.info("unvirgin models w/ ETAG >> ", collection.name, nvs.length, ' DIRTY >> ', nvs.map(function(x) { return x.id; }));
								return nvs.map(pack);
							});
						} 
						// otherwise we get all living models and suppress their UUIDs (oh god)
						return collection.getAllDeleted().then(function(deleted) { 
							var living = collection.models.filter(function(x) { return !x.nosync; }),
								tosend = deleted.concat(living);
							log.info("unvirgin no ETAG ", collection.name, " getAllDeleted:", deleted.length, " + living:", living.length, " = ", tosend.length);
							return tosend.map(function(x) { return pack(x); });
						});
					});
				},
				unpack = function(doc) { 
					// unpacks response from server
					var docdata = doc.data && JSON.parse(doc.data) || {};
					docdata.deleted_ = doc.deleted;
					docdata.uuid_ = doc.uuid;
					docdata.timestamp_ = doc.timestamp;
					docdata.prevuuid_ = doc.previousUuid;
					docdata.file_ = doc.isFile;
					docdata.filethumbnail_ = (doc.isFile && doc.file.thumbnail) || undefined;
					docdata.filetype_ = (doc.isFile && doc.file.mimetype) || undefined;                                        
					docdata.filename_ = (doc.isFile && doc.file.name) || undefined;
					docdata.fileext_ = (doc.isFile && doc.file.extension) || undefined;                    
					return docdata;
				},
				resolveConflict = function(model, docdata) {
					// log.debug('got a conflict, defaulting to reverting to incoming version', model.attributes, 'vs', docdata);
					// do not restore:
					log.info('resolveConflict', model.collection.name, '/', model.id);
					model.uuid = docdata.uuid_;	
					// if both deleted than deleted				
					if (docdata.deleted_ && model.deleted) { 
						return model.save(null, {virgin:true}); 
					}
					if (docdata.deleted_) { 
						log.info('resolveConflict', model.collection.name, '/', model.id, "remotely deleted, destroy local ");
						return model.destroy({virgin:true});
					} 
					if (model.deleted) { 
						log.info('resolveConflict', model.collection.name, '/', model.id, "locally deleted, destroy remote ");
						return model.save(); // virgin == false
					}
					// fall through
					// neither model or doc is delteed, let's merge keys with a preference for local
					var dirt = 0,
						dedocdata = storage.deserialise_d(docdata);
					// dirt keeps track of things that need to be propagated back up
					_.map(dedocdata,function(v,k) { 						
						var modelv = model.get(k);
						if (modelv === undefined) { 
							log.info("modelv undefined ", k, v, modelv);
							model.set(k,v); 
						} else if (_.isArray(v) && _.isArray(modelv) && !_.isEqual(v,modelv)) { 
							// merge arrays
							log.info("arrays merging ", k, v, modelv);
							model.set(k, _.union(v, modelv));
							if (!_.isEqual(v,model.get(k))) { dirt++; }
						} else if (_.isObject(v) && _.isObject(model.get(k)) && !_.isEqual(v,modelv)) {
							log.info("objects merging ", k, v, modelv);
							model.set(k, _.extend({},v,model.get(k)));
							if (!_.isEqual(v,model.get(k))) { dirt++; }
						} else if (v !== modelv) {
							// keep old value, let it pass through
							model.set(k,v);
						} 
					});					
					if (dirt === 0) { 
						// finally, look for new keys
						_.chain(model.attributes).keys().difference(_.keys(dedocdata)).map(function(modelv,k) {
							log.info('resolveConflict, new key coming in ', k);
							dirt++;
						});
					}
					log.info('resolveConflict ', model.collection.name, '/', model.id, ' saving virgin ', dirt === 0);
					return model.save(null, {virgin:dirt === 0}); 
				};

			var Syncer = function() {
				// watch for remote
				var this_ = this,
					autosync = true;

				this.syncingCollections = {};
				this.dirty_collections = {};

				this.debounce_sync = _.debounce(function() {
					if (autosync) { 
						var cs = _.values(this_.dirty_collections);
						this_.dirty_collections = {};
						log.debug('debounced sync, calling sync from watch ', cs.map(function(x) { return x.name; }));
						return cs.map(function(c) { 
							// comment this out .. 
							// console.info('Syncer.debounce_sync -- syncCollection --', c.name);
							return this_.syncCollection(c).catch(function(err) { 
								console.error("error while debounce syncing ", c.name, err); 
							});  
						});
					}
				}, 1000); // tune this timeout

				remote.on('socket:model', function(sync_etag) { 
					log.debug('SOCKET :: got a request to sync ', sync_etag);
					var etag = sync_etag.etag, 
						cname = sync_etag.collection;

					if (!storage.isFetched(cname)) { 
						console.info('skipping doing anything for unfetched collection ', cname); 
						return; 
					}

					if (!this_.syncingCollections[cname]) {
						this_.syncingCollections[cname] = true;                        
						return storage.getCollection(cname).then(function(c) { 
							return c.getETag().then(function(old_etag) { 
								if (old_etag && old_etag === etag) { 
									log.debug("SYNC TRIGGER(", cname, "): eTag Matches, so we just sleep on this one");
									this_.resumeRemoteListening(c);
									return;
								} else {
									log.debug("SYNC TRIGGER(", cname, "): eTag Doesn't match so we'll initiate a sync on ", cname, ' with socket etag ', etag);
									return this_.syncCollection(c, etag);
								}
							});
						});
					} else { 
						log.debug("SYNC TRIGGER() : not watching atm ¬_¬"); 
						// experimental
						return storage.getCollection(cname).then(function(c) { c.pushPendingETag(etag); });
					}
				});
				// set up syncing ---------
				if (remote.getState() === remote.CONNECTED) { this_.sync();  }
				remote.on('stateChange', function(state) { if (state === remote.CONNECTED) { this_.sync(); }  });
			};

			Syncer.prototype = {
				suppressRemoteListening:function(c) { 
					c.syncing = true;
					this.syncingCollections[c.name] = true; 
				},
				resumeRemoteListening:function(c) { 
					// log.debug('resuming remote for ', c);
					delete c.syncing;
					delete this.syncingCollections[c.name]; 
					// log.debug(' syncing collections ', this.syncingCollections);
				},
				isSyncing:function(name) { return this.syncingCollections[name];},
				watchCollection:function(c) { 
					var this_ = this;
					c.on('savemodel', function(m) { 
						// log.debug('savemodel signal, testing dirty ', m.collection.name, m.id, m.virgin, m.nosync, m);
						if (!m.virgin && !m.nosync && remote.getState() === remote.CONNECTED) { 
							// log.debug('triggering dirty on ', m.collection.name, '/', m.id, m.virgin, m.nosync);
							this_.dirty_collections[c.name] = c;
							this_.debounce_sync();
						}
					});
				},
				syncCollection : function(collection, new_etag_from_socket) { 

					log.info("syncCollection beginning > ");
					var this_ = this,
						collated_promise = collateCollectionUnvirginModels(collection);

					return collection.getETag().then(function(old_etag) {
						// log.debug('syncCollection ', collection.name, ' - ', old_etag);
						this_.suppressRemoteListening(collection);
						return collated_promise.then(function(collated_arr) { 
							log.debug('>> sync ', collection.name, collated_arr.length, collated_arr, old_etag, 'deleted: ', collated_arr.filter(function(x) { return x.deleted; }).length);
							// >> new 
							var committing = u.dict(collated_arr.map(function(tosend) { 
									// console.info('to send ', tosend.id, tosend.collection, collection.name, collection.get(tosend.id));
									var mid = tosend.id, 
										cid = tosend.collection,
										attrs = _.clone(collection.get(mid) && collection.get(mid).attributes || {});
									return [JSON.stringify([cid,mid]), attrs];
								})),
								getCommitting = function(doc) {
									var mid = doc.id, cid = doc.collection;
									return committing[JSON.stringify([cid,mid])];
								},
								isCommitting = function(doc) { 
									return getCommitting(doc) !== undefined;
								};

							// console.log('collated arr committing >', committing);
							// 
							return remote.apiRequest({ 
								url: ['','collection', collection.name].join('/'), method: 'PATCH', data: collated_arr,
								headers: old_etag ? { range: old_etag } : {}
							}).then(function (res) {
								// console.info("@@@ sync apiRequest response ", res);
								var data = res.data, // res[0],
									headers = res.headers, // res[2],
									new_etag = headers('etag'),
									conflicts = data.errors && data.errors.filter(function(err) { return err.error === 'ERR_MODEL_CONFLICT'; }) || [];

								// console.info('@@@@@ sync headers ', new_etag);
								// log.debug('sync res ', collection.name, ' !!!!!!!!!!!!!  !!!!!!!!!!!! data ', data, ' status ', status, ' headers ', headers);
								log.debug(collection.name,  ' ~~ sync response :: >> ', 'errors : ', data.errors, conflicts, ' responses ', data.response);

								if (collection.oneway) { 
									// with a one way collection, we completely ignore conflicts & commit to virgin immediately
									console.info('collection oneway', collection.name);
									return Promise.all(collated_arr.map(function(cm) {
										var mp = collection.get(cm.id) !== undefined ? 
											Promise.resolve(collection.get(cm.id)) : 
											collection.getDeleted(cm.id);  // deleted, so resurrect.
										return mp.then(function(m) { 
											if (m.virgin) { return; }
											return m.save(null, {virgin:true}); 
										});
									}));
								} 
								// not oneway, so we start taking updates
								return Promise.all(conflicts.map(function(err) { 
									// Step 1 :: handle conflicts. 
									// in the case of a conflict, err.latest contains
									// the latest document known to the server. we retrieve the corresponding
									// model

									var modelid = err.latest.id, 
										cname = err.latest.collection, 
										docdata = unpack(err.latest);

									u.assert(cname === collection.name, "collection name doesnt match " + cname + " - " + collection.name );
									log.debug('conflict res ~ ', modelid, cname, docdata);

									var mp = collection.get(modelid) !== undefined ? 
										Promise.resolve(collection.get(modelid)) : 
										collection.getDeleted(modelid);  // deleted, so resurrect.
									return mp.then(function(model) { 
										log.debug('Resolving conflict (',model.collection.name, '/', model.id, ')', "modelDEL:",model.deleted, " docdataDEL:",docdata.deleted_, collection.get(modelid) !== undefined);
										return resolveConflict(model, docdata).then(function() { return model; });
										// log.debug('Resolving result (',model.collection.name, '/', model.id, ')', virgin);
										// return model.save(null, {virgin:virgin}).then(function() { return model; });
									});
									// otherwise still living
								})).then(function(conflictmodels) { 
									// Step 2 :: update responses
									// for all responses other than conflicted ones, we take them wholesale:
									// that is, for models we know about we update them, for models
									// we don't know about, we create them

									// if oneway, then we're not storing anything locally, so we simply set them all
									// to virgin:true

									log.info('data response ', collection.name, data.response.length, 'vs collated ', collated_arr.length);

									return Promise.all(data.response.map(function(r) { 
										if (!r.collection) { throw new Error(' Error no collection specified ' + r ); }
										// log.debug('received from server ', r.collection, '/', r.id, unpack(r), r, 'iscommitting? > ', isCommitting(r), r.data, getCommitting(r));
										u.assert(r.collection === collection.name, "Response collection mismatch ", r.collection, collection.name);

										// skip forbidden ids, 
										if (isForbiddenID(r.id)) { return; }

										var mp = r.deleted ? collection.getDeleted(r.id) : Promise.resolve(utils.getModel(collection,r.id));                                    
										return mp.then(function(model) {
											// if (r.deleted) { log.debug("Got deleted model ", model.id); }
											// ignore conflict models cos we already saved them
											if (conflictmodels.indexOf(model) >= 0) { return model; }

											log.info('phase 2 non-conflicts ', collection.name, model.id, 'deleted? ', model.deleted, 'virgin? ', model.virgin);

											var docdata = unpack(r),
												dedocdata = storage.deserialise_d(docdata);
											// new code --------------------------------
											log.debug("sync() ", r.collection, '/', r.id, ': v?', model.virgin, 'isCommitting?', isCommitting(r), ' ', 'isequal', definedEqual(getCommitting(r), model.attributes), model.attributes, getCommitting(r));

											if (!model.uuid || 
												(isCommitting(r) && definedEqual(getCommitting(r), model.attributes)) ||
												(!isCommitting(r) && model.virgin)) {
												// log.debug('sync() :: successfully safe to save from server ', model.collection.name, '/', model.id, model, model.virgin, docdata);

												log.debug('sync phase2 d2m (',model.collection.name, '/', model.id, ')', docdata, model, docdata.rev, model._rev);
												// log.debug('sync phase2 d2m dedocdata (',model.collection.name, '/', model.id, ')', dedocdata, model, dedocdata.rev, model._rev);

												storage.d2m(docdata,model,false);
												return model.save(null, {virgin:true}).then(function() { return model; });
											} else {
												log.debug('sync() :: ERR ', model.id, ' got some sort of conflict, more recent so lets leave virgin untrue, setting uuid_ ', docdata.uuid_);
												model.uuid = docdata.uuid_;
												return model; 
											}
										});
									}));
								}).then(function () { 
									// finally, update our etags
									var etag = new_etag || new_etag_from_socket || collection.popPendingETag();
									log.debug(collection.name, ' end of sync :: committing etag >>>> ', etag, collection.name);									
									return collection.setETag(etag);
								});                        
							}).then(function() { 
								// resume listening for remote updates
								// log.debug('end of sync :: resuming normal listening to socket ');
								log.debug('resuming remote listening ', collection.name);
								this_.resumeRemoteListening(collection);
								collection.vacuum();
								return;
							});
						});
					});
				},
				ongoing_syncs:{},
				sync : function(names) {
					// sync all collections!
					var this_  = this,
						ongoing = this.ongoing_syncs;

					if (remote.authed()) {
						return storage.getCollections(names).then(function(collections) { 
							var sync_returns = collections.map(function(c) { 
								if (ongoing[c.name]) { return ongoing[c.name]; }
								ongoing[c.name] = this_.syncCollection(c).then(function() { 
									delete ongoing[c.name];
									log.debug("<< DONE SYNCING COLLECTION ", c.name);
								}).catch(function(err) { 
									delete ongoing[c.name];
									console.error("sync error for ", c.name, err); 
									// window._err = err;                                   
									throw err;
								}); 
								return ongoing[c.name];
							});
							log.debug('sync returns ', sync_returns);
							return Promise.all(sync_returns).then(function() { log.debug('DONE sync returns');	});
						});
					} 
					return Promise.reject(new Error("not connected"));
				}
			};

			var instance = new Syncer();
			window._sync = instance;
			return instance;
	});
})();
