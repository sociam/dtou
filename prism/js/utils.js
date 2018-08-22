/* global angular, d3, _, jQuery, moment, Handlebars, cordova */

(function () {

	var DEBUG = false;

	var PRODUCTION_SERVER = {
			MAIN: 'https://lifecour.se/api/v2',
			BASEWS: 'https://lifecour.se',
			WS: '/api/v2/socket.io'
		},
		BETA_SERVER = {
			MAIN: 'https://beta.lifecour.se/api/v2',
			BASEWS: 'https://beta.lifecour.se',
			WS: '/api/v2/socket.io'
		},		
		DEBUG_SERVER = {
			MAIN: 'http://localhost:3200',
			BASEWS: 'http://localhost:3200',
			WS: '/socket.io/'
		},

		SERVER = undefined, // PRODUCTION_SERVER; // BETA_SERVER; // DEBUG_SERVER

		// - TODO make this configurable
		DTOU_CTR = 'http://192.168.99.100:80',
		DTOU_ROUTER = 'http://52.90.1.84',
        STORAGE_LOC = 'http://192.168.99.100:5984';

	angular
		.module('dtouprism').factory('utils', function ($injector, $timeout) {
			var utils = {
                    REMOTE_SERVER_URL: SERVER && SERVER.MAIN || undefined,
                    REMOTE_WS_BASE: SERVER && SERVER.BASEWS || undefined,
                    REMOTE_WS_PATH: SERVER && SERVER.WS || undefined,
                    TWENTY_FOUR_HOURS_USEC: 24 * 60 * 60 * 1000,
                    debug: function() {
                        return DEBUG;
                    },
                    dtou_ctr: function() {
                        return DTOU_CTR;
                    },
                    dtou_router: function() {
                        return DTOU_ROUTER;
                    },
                    storage_location: function() {
                        return STORAGE_LOC;
                    },
                    setConf: function(blob) {
                        // - helper function to configure some opts
                        return new Promise(function(resolve, reject) {
                            chrome.storage.local.get(['dtouprism_conf'], function(result) {
                                if(!blob) return resolve(result.dtouprism_conf);
                                var updated = _.merge(result.dtouprism_conf, blob);
                                chrome.storage.local.set({'dtouprism_conf': updated}, function(){
                                    resolve(updated);
                                });
                            });
                        });
                    },
                    getConf: function() {
                        return new Promise(function(resolve, reject) {
                            chrome.storage.local.get(['dtouprism_conf'], function(result) {
                                resolve(result.dtouprism_conf);
                            })
                        })
                    },
					getFactory: function (factoryName) {
						return $injector.get(factoryName);
					},
					getModel: function (collection, id, nosync) { // FIXME: move to storage?
						var existing = collection && collection.get(id);
						if (existing !== undefined) {
							existing.deleted = false;
							return existing;
						}
						var newmodel = collection._makeImmediate(id, {}, nosync);
						return newmodel;
					},
					guid: function(len) {
						len = len || 64;
						var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-';
						return Date.now() + '-' + this.range(0,len).map(function () {
							return alpha[Math.floor(Math.random() * alpha.length)];
						}).join('');
					},
					objectMatcher: function (obj) {
						// returns a function that matches all keys with the object
						return function (t) {
							return _(obj).map(function (v, k) {
								return t !== undefined && t[k] === v;
							}).reduce(function (x, y) {
								return x && y;
							}, true);
						};
					},
					safeApply: function ($scope, fn) { $timeout(fn, 0); },			
					// PLATFORM
					getPlatform: function () {
						console.info('getPlatform resulting in ', window.device && window.device.platform);
						return window.device && window.device.platform || 'other';
					},
					isiOS: function () {
						return this.getPlatform() === 'iOS';
					},
					isAndroid: function () {
						return this.getPlatform() === 'Android';
					},
					setScrollLock: function (scope) {
						// enables and disables native scroll to combat bugs pertaining
						// to note capture.
						var setScrollLock = function (tf) {
							try { cordova.plugins.Keyboard.disableScroll(tf); } catch (e) { }
						};
						setScrollLock(true);
						scope.$on('$destroy', function () { setScrollLock(false); });
					},
					hideKeyboard: function () {
						try { cordova.plugins.Keyboard.close();	} catch(e) { }
					},

					// ARRAY METHODS
					objMap: function (ino, pred) {
						var out = {},
							v, k;
						for (k in ino) {
							v = pred(ino[k], k);
							if (v !== undefined) { out[k] = v; }
						}
						return out;
					},
					

					// MATH
					getImperial: function (type, v) {
						if (typeof v !== 'undefined') {
							if (type === 'weight') {
								var totalPounds = Math.round(v / 0.453592);
								totalPounds = totalPounds % 14;
								return {
									stones: (Math.round(v / 0.453592) - totalPounds) / 14,
									pounds: totalPounds
								};
							}

							if (type === 'height') {
								var totalInches = Math.round(v / 2.54);
								totalInches = totalInches % 12;
								return {
									feet: (Math.round(v / 2.54) - totalInches) / 12,
									inches: totalInches
								};
							}
						}
					},
					getMetric: function (type, v) {
						if (typeof v !== 'undefined') {
							if (type === 'weight') {
								return ((parseInt(v.stones)||0) * 14 + (parseInt(v.pounds)||0)) * 0.453592;
							}
							if (type === 'height') {
								return ((parseInt(v.feet)||0) * 12 + (parseInt(v.inches)||0)) * 2.54;
							}
						}
					},
					
					// DATE
					plusDays: function (d, i) {
						return moment(d).add(i, 'days').toDate();
					},
					daysOffset: function (d, i) {
						return moment(d).add(i, 'days').toDate();
					},
					startofDay: function (d) {
						if (typeof d === 'string') { d = new Date(d); }
						return moment(d).startOf('day').toDate();
					},
					endofDay: function (d) {
						if (typeof d === 'string') { d = new Date(d); }
						return moment(d).endOf('day').toDate();
					},
					isSameDay: function (d1, d2) {
						return this.startofDay(d1).valueOf() === this.startofDay(d2).valueOf();
					},
					isToday: function (d) {
						return this.startofDay(d).valueOf() === this.startofDay(new Date()).valueOf();
					},
					
					toRelativeDateString: function (d) {
						var DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
						if (typeof d === 'string') {
							var dd = new Date(d);
							if (isNaN(dd.getTime())) {
								d = new Date(parseInt(d));
							} else {
								d = dd;
							}
						}
						if (typeof d === 'number') { d = new Date(d);}
						if (!_.isDate(d)) {
							console.error('couldnt parse a date ', d, typeof d);
							return;
						}
						if (this.isToday(d)) { return 'Today'; }
						if (this.isSameDay(d, this.daysOffset(new Date(), -1))) { return 'Yesterday'; }
						return DOW_FULL[d.getDay()];
					},
					toISODateString: function (d) {
						if (d === undefined) { return '';}
						return moment(d).format('MMMM DD, YYYY');
					},
					toISOTimeString: function (t) {
						return moment(t).format('HH:mm');
					},
					setHHMM: function (d, s) {
						var hhmm = s.split(':');
						return moment(d).hour(Number(hhmm[0])).minute(Number(hhmm[1])).second(0).millisecond(0).toDate();
					},

					assert: function (t, s) { if (!t) { throw new Error(s); }},
					dict: function (pairs) { var o = {};	pairs.map(function (pair) { o[pair[0]] = pair[1]; }); return o; },
					dictCat: function (pairs) {
						var o = {};
						pairs.map(function (pair) {
							var key = pair[0];
							o[key] = o[key] ? o[key].concat(pair[1]) : [pair[1]];
						});
						return o;
					},
					defined: function (x) { return !_.isUndefined(x) && x !== null; },
					range: function (l,h) {
						var a = [];
						if (_.isUndefined(h)) { h = l; l = 0; }
						for (var i = l; i < h; i++) { a.push(i); }
						return a;
					},
					getUrlParam: function(url, sParam) {
					    var sPageURL = decodeURIComponent(url.substring(url.indexOf('?')+1)),
					        sURLVariables = sPageURL.split('&'),
					        sParameterName,
					        i;

					    for (i = 0; i < sURLVariables.length; i++) {
					        sParameterName = sURLVariables[i].split('=');
					        console.log('sParameterName[0]', sParameterName[0]);

					        if (sParameterName[0] === sParam) {
					            return sParameterName[1] === undefined ? true : sParameterName[1];
					        }
					    }
					},					
					getCSV: function (url) {
						return new Promise(function (resolve, reject) {
							d3.csv(url).get(function (err, rows) {
								if (err) {
									reject('could not load ', err);
								} else {
									resolve(rows);
								}
							});
						});
					},
					capitalizeFirstChar: function (str) {
						if (!_.isString(str) || str.length === 0) { return str; }
						return str.slice(0, 1).toLocaleUpperCase() + str.slice(1);
					}
				};
			// prebind
			utils = utils.dict(
				_.map(utils,function (v, k) {
					if (typeof v === 'function') { return [k, _.bind(v, utils)]; }
					return [k,v];
				})
			);
			console.log('returning ', utils);
			return utils;
		})
		.filter('capitalizeFirst', function (utils) {
			return utils.capitalizeFirstChar;
		})
		// use scopeResolve instead of ui-router resolve to avoid lag when loading a state
		.service('scopeResolve', function ($q, $timeout) {
			return function ($scope, resolves) {
				$scope.stateLoading = true;
				return $q(function (resolve) {
					var done = function () {
							jQuery('body .app').off('transitionend webkitTransitionEnd oTransitionEnd', done);
							$timeout.cancel(timeout);
							resolve();
						},
						timeout = $timeout(done, 1500);
					// trying to resolve resolves causes choppy animation, so wait for animation to finish
					jQuery('body .app').one('transitionend webkitTransitionEnd oTransitionEnd', done);
				}).then(function () {
					return $q(function (resolve) { $timeout(resolve, 100); }); // extra time to finish rendering
				}).then(function () {
					return $q.all(resolves);
				}).catch(function (err){
					console.error('scopeResolve error', err);
					// FIXME
					throw err;
				}).finally(function () {
					// give angular some time to render the dom to prevent choppy fade in animation
					$timeout(function () {
						$scope.stateLoading = false;
					}, 150);
				});
			};
		})
		.directive('mustache', function () {
			return {
				restrict: 'A',
				scope: { mustache: '=' },
				priority: 60000,
				terminal: true,
				link: function ($scope, $element) {
					var html = $element.html(),
						template = Handlebars.compile(html);
					$element.html(template($scope.mustache));
				}
			};
		});
}());
