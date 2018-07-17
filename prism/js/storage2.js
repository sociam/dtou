/* global angular, _, Backbone, PouchDB, $, emit */

// Ax
// refactored to a+ promises format

(function () {
	angular.module('dtouprism')
		.factory('storage', function (remote, utils, $log) {

			var DEBUG = utils.debug(),
				log = $log.instance('storage', 'maroon'),
				PDB_OPTIONS = {
					// adapter:'websql', 
					location:'default' // now required, fixes the iCloud bug
				};

			if (!DEBUG) { log.disable(); }

			var FORCE_SAVE = false,
				assert = function (b, s) { if (!b) { throw new Error(s); } },
				getSync = function () {
					return utils.getFactory('storagesync');
				},
				objMap = function (ino, pred) {
					var out = {};
					for (var k in ino) {
						if (ino.hasOwnProperty(k)) { 
							var v = pred(ino[k], k);
							if (v !== undefined) { out[k] = v; }
						}
					}
					return out;
				},
				prepare_id = function (id) {
					assert(id !== undefined, 'id must not be undefined');
					assert(typeof id === 'string', 'id must be a string');
					return id.trim();
				},
				deserialise_d = function (d) {
					// database representation to attribute rep
					var deobj = function (v) {
						if (v.type_) {
							if (v.type_ === 'date') {
								return new Date(v.val_);
							}
							if (v.type_ === 'objref') {
								throw new Error("Not implemented yet");
							}
							throw new Error("Unknown type ", v.type_);
						}
						// no, so just map
						return objMap(v, dispatch);
					},
					deprim = function (v) {
						// primitives are served up raw
						return v;
					},
					dispatch = function (v) {
						if (v === undefined) { return; }
						if (_.isArray(v)) { return v.map(dispatch);  }
						if (_.isObject(v)) { return deobj(v); }
						// not an object, not an array
						return deprim(v);
					};

					return objMap(d, function (v, k) {
						// skip special variables
						if (k[0] === '_' || k[k.length-1] === "_") { return; }
						// dispatch others
						return dispatch(v);
					});
				},
				d2m = function (d, model, replace_rev) {
					var attrs = deserialise_d(d);
					// model.set(attrs);
					model.attributes = attrs;
					// set special variables in model from doc //
					_.extend(model, {
						_rev: replace_rev === false ? model._rev : d._rev,
						virgin: d.virgin_,
						uuid: d.uuid_,
						deleted: d.deleted_,
						nosync: d.nosync_,
						file: d.file_,
						filethumbnail: d.filethumbnail_,
						filetype: d.filetype_,
						filename: d.filename_,
						fileext: d.fileext_
					});
					return model;
				},
				m2d = function (m, justattrs) {
					// attribute to database representation SERIALISE
					// justattrs => true means only attributes, not special vars
					var mattrs = objMap(m.attributes, function (v,k) {
						if (k.length > 0 && k[k.length - 1] !== '_') { return v; }
						// else return undefined, which will kill it
					}),
					deobj = function (v) {
						if (_.isDate(v)) { // if (v instanceof Date) {
							return { type_: 'date', val_: v.toISOString() };
						}
						if (v instanceof Backbone.Model) {
							return { type_: 'objectref', model_: v.id, collection_:v.c.name };
						}
						// raw model
						return objMap(v, dispatch);
					},
					deprim = function (v) {
						// primitives are served up raw
						return v;
					},
					dispatch = function (v) {
						if (v === undefined) { return; }
						if (_.isArray(v)) { return v.map(dispatch);  }
						if (_.isObject(v)) { return deobj(v); }
						// not an object, not an array
						return deprim(v);
					};

					if (justattrs) {
						// log.log('justdoc, forgoing extra vars', mattrs);
						return objMap(mattrs, dispatch);
					}
					// keep track of special vars
					// local:
					return _.extend(objMap(mattrs, dispatch),{
						// rev_: forsyncing ? m._rev : undefined,
						virgin_: m.virgin,
						uuid_: m.uuid,
						deleted_: m.deleted,
						nosync_: m.nosync,
						file_: m.file,
						filethumbnail_: m.filethumbnail,
						filetype_: m.filetype,
						filename_: m.filename,
						fileext_: m.fileext
					});
				},
				PouchModel = Backbone.Model.extend({
					// idAttribute:'_id',
					initialize: function (attrs, options) {
						this.id = options.id;
						this._rev = options && options._rev;
						this._syncops = Promise.resolve(); // root of syncops
					},
					isNew: function () { return !this._rev;	},
					save: function (attrs, options) {
						var this_ = this;
						log.log("SAVE (", this.collection.name, '/', this.id, ")", this._rev, this.deleted ? 'deleted':'notdeleted', attrs, this.attributes, 'options:', options);
						// try {  throw new Error('SHOW ME A STACK TRACE');  } catch(e) { log.log(e); }

						// the version of backbone js we are using cannot handle !wait and object sets
						// so we have to manually set them.
						if (typeof attrs === 'object') { this.set(attrs); }

						this._syncops = this._syncops.then(function () {
							this_.virgin = options && options.virgin;
							// log.log("> SAFE SAVE (", this_.collection.name, '/', this_.id, ') > ', this_._rev);

							// debug
							// if (this_.collection.name === 'UsageLog' && this_.id == 'latest' && this_._rev === undefined) {
							// 	throw new Error("YO");
							// }

							return Backbone.Model.prototype.save.call(this_, attrs, _.extend({wait:true, validate:false},options)).then(function () {
								// GENERATE saveModel signal for sync.js
								// log.log("< SAFE SAVE (", this_.collection.name, '/', this_.id, ')', this_._rev, this_.virgin ? 'virgin':'notvirgin', this_.deleted ? 'deleted':'notdeleted');
								if (!this_.collection.syncing) {
									this_.collection.trigger('savemodel', this_);
								} else {
									// console.info("SKIP SAVEMODEL");
								}
								return this_;
							}).then(function () {
								// log.log("~ done triggering savemodel (", this_.collection.name, '/', this_.id, ')');
							}).then(function () {
								return this_;
							}).catch(function (ee) {
								log.error("error saving ", this_.collection.name, '/', this_.id, this_._rev, this_.deleted);
								throw ee;
							});
						});
						return this._syncops;
					},
					getFileURL: function () {
						var that = this;
						return remote.oneTimeToken().then(function (token) {
							return utils.REMOTE_SERVER_URL + '/file/' + that.uuid + '?token=' + token;
						});
					},
					getThumbnailURL: function () {
						// adds thumbnail url
						if (this.file && this.filethumbnail) {
							return "data:image/png;base64," + this.filethumbnail;
						}
					},
					destroy: function (options) {
						//
						log.log("> Deleting (", this.collection.name, '/', this.id, ")");
						var this_ = this, c = this.collection;
						this.attributes = {};
						this.deleted = true;
						return this.save(null, options).then(function () {
							log.log('< done deleting ', c.name, '/', this_.id, c.length);

							// --------------
							delete c._byId[this_.id];
							var index = c.models.indexOf(this_);
							c.models.splice(index, 1);
							c.length--;
							this_.trigger('remove', this_, c, options);

							// remove references to collection
							delete this_.collection;
							this_.off('all', c._onModelEvent, c);

							// log.log(' new collection length ', c.length);
							// ----------------
							return this_;
						});
					},
					sync: function (method, model) {
						// Warning; this sync concerns saving to local pouch only!
						var db = model.collection.db,
							docid = model.id,
							methods = {
								create: function () {
									// the reason this is *a bit* complicated is that instead of
									// deleting the document on delete, we simply give it a special flag.
									// log.log('CREATE >> ', docid, model.attributes, docid, model._rev, model.id);
									var model_doc = m2d(model);
									return new Promise(function (resolve, reject) {
										// new structure model.
										log.log('> CREATE ', model.collection.name, '/', model.id, '_rev : ', model._rev, ' virgin: ', model.virgin);
										db.put(_.extend({_id:docid}, model_doc)).then(function (res) {
											// success! nothing conflicting to clobber
											log.log('< CREATE ', model.collection.name, '/', model.id, '_rev : ', res.rev);
											// log.log('success! nothing conflicting to clobber, resolving ', model.id, model.attributes, res.rev);
											model._rev = res.rev;
											resolve(model);
										}).catch(function (ee) {
											log.log("< CREATEERROR ", model.collection.name, '/', model.id, ee);
											if (ee.name === 'conflict') {
												// then we are likely just overwriting a deleted object.
												// clobber with a new revision, by retrieving our ghost

												// var m = collection.get(docid);
												// if (m) { throw new Error(' Already exists : ' + docid ); }

												// exists in the db, but not in things -> deleted, so we just overwrite.
												return db.get(docid).then(function (doc) {
													// it's a deleted ghost, now we just force it
													log.log(">> OVERWRITING ", model.collection.name, '/', model.id, docid, doc, doc._rev, '--> with ', model_doc);
													return db.put(_.extend({_id:docid, _rev:doc._rev}, model_doc)).then(function (res) {
														log.log("<< OVERWRITING ", model.collection.name, '/', model.id);
														model._rev = res.rev;
														return resolve(model); // ready to go!
													});
												}).catch(reject);
											} else {
												log.error('error - ', ee.name, model.id, model.attributes);
												reject(ee);
											}
										});
									});
								},
								read: function () {
									// reading
									return db.get(docid).then(function (doc) {
										if (doc.deleted_) { return undefined; }
										log.log('read d2m (',model.collection.name, '/', model.id, ')', doc, model, doc.rev, model._rev);
										return d2m(doc, model);
									});
								},
								update: function () {
									log.log(' UPDATE (save) ', model.collection.name, '/', model.id, '_rev : ', model._rev, ' virgin: ', model.virgin, model.attributes);
									var ds = m2d(model);
									if (!FORCE_SAVE) {
										// here we respect the rev for efficiency
										log.log('saving ', ds, model.id, model._rev);
										return db.put(_.extend({_id:model.id, _rev:model._rev}, ds)).then(function (res) {
											// update local rev for future saves
											log.info("SAFE SAVE (",model.collection.name, '/', model.id,') DB PUT DONE rev:', res.rev);
											model._rev = res.rev;
											return model;
										}).catch(function (e) {
											log.error('save error ', e, model.id, model._rev);
											throw new Error(e);
										});
									} else {
										// force mode,
										return db.get(model.id).then(function (doc) {
											return db.put(_.extend({_id:model.id,_rev:doc._rev}, ds)).then(function (res) {
												// update local rev for future saves
												model._rev = res.rev;
												return model;
											});
										});
									}
								},
								patch: function () {
									// todo
									log.log('patch called. no idea what this is for.');
								},
								delete: function () {
									// delete is not used because we simply save() with appropriate properties
									utils.assert(false, "delete -- Code path error");
								}
							};
						return methods[method]();
				}}),
				PouchCollection = Backbone.Collection.extend({
					model:PouchModel,
					initialize: function (models, options) {
						var this_ = this;
						assert(options && options.name !== undefined, 'name must be specified');
						this.name = options.name;
						this.oneway = options.oneway;
						this._initdb = new Promise(function (accept, reject) {
							log.info('NEW pouchdb ', this_.name, PDB_OPTIONS);
							// we need to watch for gdready for the plugin to party
							Promise.resolve().then(function() { 
								var db = new PouchDB(this_.name, PDB_OPTIONS);
								db.info().then(function() { 
									this_.db = db;									
									if (DEBUG) { 
										db.on('error', function(err) { log.info('database error ', err); });	
									}
									this_.initIndexes().then(function() {
										log.log("Successful database init", this_.name);
										accept();
									}).catch(function(err) {
										log.error('Error setting up index on ', this_.name, ' dropping & recreating ', err);
										return this_.dropIndexes().then(function() {
											log.info('OK dropping indexes ');
											this_.createIndexes().then(accept).catch(function(e) {
												log.error('FAILING setting up indices ', e);
												reject();
											});
										}).catch(function() {
											this_.createIndexes().then(accept).catch(function(e) {
												log.error('FAILING setting up indices ', e);
												reject();
											});
										});
									});
								}).catch(reject);
							});
							// end todo change to watch for cordova
						});
					},
					//
					indexes : {
					  _id: '_design/lifecourse',
					  views: {
   						    // foodie: {  map: function (doc) { emit(!doc.virgin_ && !doc.nosync_); }.toString() },
   						    nonvirginsync: {  map: function (doc) { emit(!doc.virgin_ && !doc.nosync_); }.toString() },
   						    deletedsync: {  map: function (doc) { emit(doc.deleted_ && !doc.nosync_); }.toString() },
						    // deleted: {  map: function (doc) { emit(!!doc.deleted_); }.toString()   },
						    created: {
						    	map: function(doc) {
						    		if (doc.created && !doc.deleted_) { 
						    			var val = doc.created.val_;
						    			if (val === undefined) { //  && !isNaN(parseInt(doc.created))) { 
						    				val = parseInt(doc.created);
							    		} 
						    			return emit(new Date(val).toDateString());
							    	}
						    		emit("");
						    	}.toString()
						    }
						}
					},
					initIndexes:function() {
						// tests
						var this_ = this, ddoc = this.indexes, db = this.db;
						return Promise.all(_.map(ddoc.views,function(v,name) {
							log.info('kick querying ', this_.name, 'lifecourse/'+name);
							return db.query('lifecourse/'+name);
						}));
					},
					createIndexes: function() {
						var this_ = this, db = this_.db, ddoc = this.indexes;
						return db.put(ddoc);
					},
					dropIndexes : function() {
						var db = this.db;
						return db.get(this.indexes._id).then(function(doc) { return db.remove(doc);	})
							.then(function () { log.info('End of indexes'); })
							.catch(function (err) { log.error(err); });
					},
					doSync: function () {
						log.log('initiating manual sync ', this.name);
						// try { throw new Error(); } catch(e) { log.log(e.stack); }
						return getSync().sync([this.name]);
					},
					getETag: function () {
						// gets our collection-specific etag
						// log.log('ETAG got model on GET > ', model.collection && model.collection.name, '/', model.id, model, model.nosync, model.attributes.val);
						var this_ = this;
						return remote.getCredentials().then(function (credentials) {
							var model = utils.getModel(this_, 'etag_', true);
							var email = credentials && credentials.email;
							log.log('get ETAG (',email,') > ', model.collection && model.collection.name, ' => ', model.attributes[email]);
							if (email) {
								return model && model.get(email);
							}
							// no eTag.
							return;
						});
					},
					setETag: function (etag) {
						// saves our collection-specific etag
						var model = utils.getModel(this, 'etag_', true);
						log.log('> set ETAG ', model.collection.name, ' => ', etag);
						return remote.getCredentials().then(function (credentials) {
							if (credentials) {
								var email = credentials && credentials.email;
								log.log('== set ETAG (',email,') > ', model.collection && model.collection.name, ' => ', etag);
								model.set(email, etag);
								model.nosync = true; // reinforce this!
								return model.save().then(function () { return etag; });
							}
							// no point saving an etag for something we don't have credentials for!
							return Promise.resolve(model);
						});
					},
					_makeImmediate: function (modelid,attrs,nosync, noEncrypt) {
						// "make" is a conflict safe version of create, returning a deferred
						// with an error if modelid already exists.
						// warning: overrides the default implementation to get rid of ridiculous signature
						// returns a promise instead of the model
						// log.log('making immediate ', this.name, modelid);
						var this_ = this,
							m = new this.model(attrs, {id:prepare_id(modelid)});
						m.collection = this;
						m.nosync = nosync;
						m.encrypted = !noEncrypt;
						this_.add(m);
						return m;
					},
					// cannot be called create because will shadow backbone
					make: function (id, nosync) { // FIXME: move to storage?
						var existing = this && this.get(id);
						if (existing !== undefined) {
							throw new Error("model already exists with id " + id);
						}
						var newmodel = this._makeImmediate(id, {}, nosync);
						return newmodel;
					},						
					// make: function (modelid, attrs, nosync) {
					// 	var m = this._makeImmediate(modelid,attrs,nosync);
					// 	return m.save().then(function (m) { return m; });
					// },
					modelId: function (m) { return m.id; },
					_prepareModel: function (model, options) {
						// log.log('preparemodel ', model.nosync, options && options.id, options && options.nosync, model);
						var outm = Backbone.Collection.prototype._prepareModel.apply(this, arguments);
						if (outm && options && options.id || options.nosync) {
							_.extend(outm,{
								id : options.id,
								nosync : options.nosync
							});
						}
						return outm;
					},
					getVirgins: function () {
						return this.models.filter(function (x) { return x.virgin && !x.nosync; });
					},
					uploadFile: function (file, id, uuid) {
						log.info("file-upload inside storage2 file:",file);
						if (file === undefined) { throw new Error("Trying to upload an undefined file"); }
						// pass in an input file - and return the corresponding new model
						var model_id = id ? id : utils.guid(),
							this_ = this,
							params = { collection: this.name, id: model_id };

						if (uuid) { params.uuid  = uuid; }
						var url = '/file/?'+ $.param(params),
							fd = new FormData();

						fd.append('file', file, file.name);
						log.log('uploading file >> ', model_id);
						// console.log('file-upload formData',fd);
						return remote
							.apiRequest({ method:"POST", url:url, data:fd, headers: { "Content-Type": undefined } })
							.then(function (response) {
								log.log("UPLOAD FILE RESPONSE " , response);
								return new Promise(function (accept,reject) {
									var done = false,
										f = function (m) {
											log.info("ON ADD MODEL ", m, m.id);
											if (m.id === model_id) {
												// log.info('accepting!!');
												this_.off('add', f);
												accept(this_.get(model_id));
												done = true;
												return;
											}
										};
									this_.on('add', f);
									setTimeout(function () {
										if (!done) {
											this_.off('add', f);
											log.error('never got save signal from server for model ', model_id);
											reject({message:'Didnt get save from server'});
										}
									},30000);
								});
							}).catch(remote.apiCode(500), function(err) {
								log.info("Display a nice error message here ", err);
								throw err;
							}).catch(remote.apiError('ModelPreviousVersionNotFound'), function (err) {
								err.message = 'Incorrect UUID provided'; // FIXME use friendly error message
								throw err;
							}).catch(remote.apiError('ModelConflict'), remote.apiError('ModelVersionConflict'), function (err) {
								err.message = 'Model already exists'; // FIXME use friendly error message
								throw err;
							}).catch(remote.apiError('ModelVersionCreationFailure'), function (err) {
								err.message = 'Could not upload file'; // FIXME use friendly error message
								throw err;
							});
					},
					_makeZombie:function(doc) { 
						// returns a deleted model for doc
						var model = new this.model({}, { id:doc._id });
						model.collection = this; // sets our collection
						d2m(doc, model);
						model.deleted = true;
						return model;
					},
					getNonVirgins:function() {
						var this_ = this;
						return this._initdb.then(function () {
							// log.log('INIT DEB GET non virgins');
							return this_.db.query('lifecourse/nonvirginsync', { key: true, include_docs:true })
								.then(function(response) {
									// log.log(' nonvirgin view ', response.rows.length, response.rows.map(function(x) { return x.id; }));
									return response.rows.map(function(x) {
										var m = this_.get(x.id);
										return m !== undefined ? m : this_._makeZombie(x.doc);
									});
								}).catch(function(err) { log.error('getNonVirgins error caught on ', this_.name, err);	});
						});
					},
					getAllDeleted:function() { 
						var this_ = this;
						return this._initdb.then(function () {
							return this_.db
								.query('lifecourse/deletedsync', { key: true, include_docs:true })
								.then(function(response) { 
									return response.rows.map(function(x) { return this_._makeZombie(x.doc); });
								})
								.catch(function(err) { log.error('getAllDeleted error caught on ', this_.name, err); });
						});
					},
					getCreatedOn:function(date) { 
						var this_ = this;
						return this._initdb.then(function () {
							return this_.db.query('lifecourse/created', { key: date.toDateString(), include_docs:false }).then(function(response) {
								return response.rows.map(function(x) { return this_.get(x.id); });
							});
						});
					},
					// experimental patch -- emax -- 
					pushPendingETag:function(etag) { 
						this._pending_etags = this._pending_etags || [];
						this._pending_etags.push(etag);
					}, // experimental patch -- emax --
					popPendingETag:function() { 
						log.info('popping pending etag', this._pending_etags && this._pending_etags[this._pending_etags.length-1]);
						if (this._pending_etags) { 
							return this._pending_etags.pop();
						}
					}, 
					// experimental patch -- emax --

					// getNonVirginsOld: function () {
					// 	// TODO: speed this up using a view of deleted modesl
					// 	var this_ = this;
					// 	return this._initdb.then(function () {
					// 		return this_.db.allDocs({include_docs:true})
					// 			.then(function (results) {
					// 				return results.rows.map(function (row) {
					// 					// log.log('row doc ', row.doc);
					// 					if (row && row.doc && row.doc.deleted_ && !row.doc.virgin_ && !row.doc.nosync_) {
					// 						var doc = row.doc,
					// 							docid = row.id,
					// 							model = new this_.model({}, { id:docid });
					// 						model.collection = this_; // sets our collection
					// 						log.log('getNonVirgins deleted d2m (',model.collection.name, '/', model.id, ')', doc, model, doc.rev, model._rev);
					// 						return d2m(doc, model);
					// 					}
					// 				}).filter(function (x) { return x !== undefined; });
					// 			}).then(function (dead_models) {
					// 				var living_unvirgin = this_.models.filter(function (x) { return !x.virgin && !x.nosync; });
					// 				// log.log('dead models > ', dead_models.length, dead_models);
					// 				// log.log('living_unvirgin > ', living_unvirgin.length, living_unvirgin);
					// 				return living_unvirgin.concat(dead_models);
					// 			});
					// 	});
					// },
					getDeleted: function (id) {
						// retrieves a deleted stub from the database so we can update them
						var this_ = this;
						return this._initdb.then(function () {
							log.log('init db ');
							return this_.db.get(id).then(function (doc) { return this_._makeZombie(doc); }).catch(function (ee) {
								log.log(' error getting doc ', id, ' - ', ee);
								if (ee.status === 404) {
									// we don't actually have it, so create a shadow model
									var model = new this_.model({}, { id:id });
									model.collection = this_;
									model.deleted = true;
									return model;
								}
								throw ee;
							});
						});
					},
					get: function(id) {
						var b = Backbone.Collection.prototype.get.apply(this,arguments);
						if (b && b.deleted) { return undefined; }
						return b;
					},
					fetch: function () {
						// ps - you know this already, but
						// this fetch() from local pouch (nothing to do with the server!)
						var this_ = this;
						return this._initdb.then(function () {
							return this_.db.allDocs({include_docs:true})
								.then(function (results) {
									var models = results.rows.map(function (row) {
										var doc = row.doc,
											deleted = doc && doc.deleted_,
											docid = row.id,
											model = deleted || this_.get(docid) || new this_.model({}, { id:docid });

										if (deleted || docid === '_design/lifecourse') { return; }

										log.log('fetch d2m (',this_.name, '/', docid, ')', doc, model, doc.rev, model._rev);
										return d2m(doc, model);
									}).filter(function (x) { return x !== undefined; });
									log.info(this_.name, 'setting models ', models);
									this_.set(models);
									return this_;
								});
							});
					},
					vacuum: function () {
						// do misc stuff that tidies up collections
						console.info('vacuum');
						return Promise.resolve([]);
						// if (this.oneway) {
						// 	// we can kill all virgin models
						// 	return Promise.all(this.getVirgins().map(function (m) {
						// 		log.info('vacuuming up model ', m.collection.name, '/', m.id);
						// 		return m.destroy();
						// 	}));
						// }
					},
				});

			var collection_cache = {},
				collection_fetched = {},
				clearCache = function () { collection_cache = {};  collection_fetched = {};  },
				isFetched = function (name) { return collection_fetched[name]; };

			var getCollection = function (name, options) {
				if (collection_cache[name] !== undefined && !_.get(options, ['force'])) {return collection_cache[name]; }
				if (collection_cache[name]) {delete collection_cache[name]};
				var c = new PouchCollection([], _.extend({ name: name }, _.omit(options, ['force']))),
					d = collection_cache[name] = new Promise(function (resolve, reject) {
						c.fetch().then(function () {
							// register the collection with sync
							log.info('calling watchCollection, which will do a debounce sync ');
							getSync().watchCollection(c);
							resolve(c);
							collection_fetched[name] = true;
						}).catch(function (err, x) {
							log.error('storage2 getCollection error ', name, err, x);
							reject(err);
						});
					});
				return d;
			};
			var destroyCollection = function (name) {
				console.info('Destroy Collection ', name, PDB_OPTIONS);
				var db = new PouchDB(name, PDB_OPTIONS);
				return db.destroy();
			};
			var destroyAllCollections = function () {
				clearCache();
				return PouchDB.allDbs().then(function (dbs) {
					return Promise.all(dbs.map(function (dbname) {
						log.info('Delete ', dbname, PDB_OPTIONS);
						var db = new PouchDB(dbname, PDB_OPTIONS);
						return db.destroy();
					}));
				});
			};
			return {
				initialize: function () {
					if (remote.getState() === remote.CONNECTED) {
						this.sync().catch(function (e) { log.log('error syncing, not connected ', e); });
					}
				},
				getDiaryBPs: function () {
					return this.getDiary().then(function (diary){
						var bps = diary.models.filter(function (model){
							if(model.attributes.bp) { return true; }
							return false;
						});
						return bps;
					});
				},
				get : function (name) {	return getCollection(name); },
				getAFIQs: function () { return getCollection("AFIQs"); },
				getDocs: function () {  return getCollection("Docs"); },
				getProfile: function () { return getCollection("Profile"); },
				getPrescriptions: function () { return getCollection("Prescriptions");   },
				// getLocalStuff: function () { return getCollection("Stuff");  },
				getNotifications: function () { return getCollection("Notifications");  },
				getUsageLog: function () { return getCollection("UsageLog", {oneway:true});  },
				getCollection : getCollection,
				// used by storage-remote, our "friend"
				PouchModel:PouchModel,
				m2d:m2d, // also used for serialising/deserialising models to server
				d2m:d2m, //
				deserialise_d:deserialise_d,
				PouchCollection:PouchCollection,
				getCache: function () { return collection_cache; },
				getCollections: function (cnames) {
					// optional list of cnames specifies collections to get
					// defaults to standard AFinity set
					var this_ = this;
					if (cnames) {
						return Promise.all(cnames.map(function (n) { return this_.getCollection(n); }));
					}
					// return default set
					return Promise.all([
						this.getDiary(),
						this.getAFIQs(),
						this.getDocs(),
						this.getProfile(),
						this.getPrescriptions(),
						this.getNotifications(),
						this.getUsageLog()
					]);
				},
				// debug:
				pdb : function (name) { return new PouchDB(name, PDB_OPTIONS); },

				// clear in memory cache
				clearCache : clearCache,
				isFetched : isFetched,

				// delete persistent data
				destroyCollection:destroyCollection,
				destroyAllCollections:destroyAllCollections,
				sync: function () { return getSync().sync();  }
			};
	});
})();
