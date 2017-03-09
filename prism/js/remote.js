/* global angular, Backbone, _, io, moment, device */

// sync
//   remote sync logic for storage.js to v2 PInCH Server
//

(function () {
	angular.module('dtouprism')
		.factory('remote', function (utils, $http, appConstants, $log, $rootScope) {
			$log = $log.instance('remote', 'orange');
			var DEBUG = true;
			if (!DEBUG) { $log.disable(); }
			var u = utils,
				getCredentials = function () {
					return utils.getFactory('storage').getProfile().then(function (c) {
						return utils.getModel(c, 'credentials', true).attributes;
					});
				},
				setCredentials = function (email, token) {
					return utils.getFactory('storage').getProfile().then(function (c) {
						var m = utils.getModel(c, 'credentials', true);
						if (email && token) {
							$log.log("remote :: SETTING NEW AUTHED USER ", email, " :: ", token);
							m.set('email', email);
							m.set('token', token);
							remote.trigger('authenticated', email);
						} else {
							m.unset('token');
							disconnect();
							remote.trigger('unauthenticated');
						}
						return m.save();
					});
				},
				makeError = function(code, props) { 
					return _(new Error()).extend({code:code},props !== undefined ? props : {});
				},
				// states
				PENDING = -1,
				NOT_AUTHED = 0,
				AUTHED_DISCONNECTED = 1,
				CONNECTED = 2,
				PAYMENT_NEEDED = 3,
				SERVER_DECOMMISSIONED = 4,
				state = PENDING,
				isOnboarded = function () {
					return utils.getFactory('storage').getProfile().then(function (profile) {
						var obModel = utils.getModel(profile, 'onboarded');
						return obModel.get('status-' + appConstants.APPID + '-onboarding-sync');
					});
				},
				connected_promise,
				resetConnectedPromise = function() { 
					connected_promise = {};
					connected_promise.promise = new Promise(function(a) { connected_promise.resolve_accept = a; });
				},
				switchState = function (next_state) {
					$log.log('remote :: switchState', next_state);
					// var prev_state = state;
					// if (prev_state === next_state) { return; }
					// state = next_state;
					// iremote.trigger('stateChange', state);
					// if (next_state === NOT_AUTHED) {
					// 	setCredentials(); // clear token
					// 	disconnect();
					// 	isOnboarded().then(function (onboarded) {
					// 		if (onboarded) { return $state.go('reauth'); }
					// 	});
					// 	resetConnectedPromise();
					// 	// otherwise don't do anything
					// }
					// if (next_state === AUTHED_DISCONNECTED) {
					// 	$log.info(' :: disconnected ::');
					// 	resetConnectedPromise();						
					// 	// don't do anything
					// }
					// if (next_state === PAYMENT_NEEDED) {
					// 	$log.info(' :: payment needed ::');
					// 	// TODO make this sensitive to state >> 
					// 	isOnboarded().then(function (onboarded) {
					// 		console.log('Payment Needed >> is Onbaorded? ', onboarded);
					// 		// check for current state
					// 		if (onboarded && $state.current.name !== 'subscribe') { 
					// 			console.log('Going to subscribe -> ');
					// 			return $state.go('subscribe', { expired: true }); 
					// 		}
					// 	});
					// 	// 
					// }
					// if (next_state === SERVER_DECOMMISSIONED) {
					// 	$log.info(' :: server decommisioned ::');
					// 	$rootScope.toast({
					// 		message: appConstants.APPNAME + ' has been unable to connect to LifeCourse. Please check to see if there are updates for ' + appConstants.APPNAME + '.'
					// 	});
					// }
					// if (next_state === CONNECTED) {
					// 	// yay
					// 	connected_promise.resolve_accept();
					// }
				},
				getConnectedPromise = function() { return connected_promise.promise; },
				apiRequest = function (options) { // TODO: error translations. e.g. UserLoginFailure -> Incorrect username or password. Please check them and try again.
					var requireToken = options.requireToken !== false,
						doSwitchState = options.switchState !== false,
						timeout;

					return new Promise(function (resolve, reject) {
						timeout = setTimeout(function () {
							reject({ code: 0 }); // fake a network error
						}, 60000); 
						return getCredentials().then(function (creds) {
							if (requireToken && !creds) { throw new Error("No credentials stored, cannot remote - " + JSON.stringify(options));  }
							var token = options.overrideToken !== undefined ? options.overrideToken : creds !== undefined && creds.token;
						
							$log.log('request :: ', utils.REMOTE_SERVER_URL + options.url);
							return $http(_.extend({}, options, {
								url: utils.REMOTE_SERVER_URL + options.url,
								headers: _.extend({}, options.headers, token ? { 'Authorization': 'token ' + token } : {})
							})).then(function (response) {
								clearTimeout(timeout);
								resolve(response);
							}).catch(function (response) {
								clearTimeout(timeout);								
								$log.error('request err', response.data);
								reject(_.extend(new Error(), response.data, { code: response.status }));// FIXME
							});
						});
					}).catch(remote.apiError('ERR_INVALID'), function (err) {
						err.message = u.capitalizeFirstChar(err.message);
						_.each(err.reason, function (o) {
							o.message = u.capitalizeFirstChar(o.message); // make first letter uppercase
						});
						throw err;
					}).catch(function (err) {
						if (err.code === 401 && doSwitchState) {
							switchState(NOT_AUTHED);
						} else if (err.code === 402 && doSwitchState) {
							switchState(PAYMENT_NEEDED);
						} else if (err.code === 410 && doSwitchState) {
							switchState(SERVER_DECOMMISSIONED);
						} else if (err.code === 504) {
							$log.error('Got a 504 gateway timeout', err);
							err.message = 'LifeCourse is busy at the moment. Please wait 1 minute and try again.';
						} else if (err.code <= 0) { // networkError
							//if (doSwitchState) { switchState(AUTHED_DISCONNECTED); } // it makes no sense to do this is the user is not authed
							console.error('Error 0 URL ', options.url, ' options: ', options, err);
							window._err_opts = options;
							window._err = err;
							err.message = appConstants.APPNAME + ' could not connect to the internet. Please ensure that you have mobile signal or WiFi and try again.';
						} else if (!err.error || !err.message) {
							err.message = 'LifeCourse is busy at the moment. Please try again later.';
						}
						throw err;
					}).finally(function () {
						// fall through
						clearTimeout(timeout);
					});
				},

				socket,
				//
				connect = function () {
					// TODO: This should be replaced with utils.REMOTE_SERVER_URL + "/ws" or something
					if (utils.REMOTE_SERVER_URL === undefined){
						// configured for offline
						throw new Error("Offline Mode"); 
					}
					$log.log('connect!');					
					if (socket && state === CONNECTED) {
						$log.log('already connected --');
						return Promise.resolve(socket);
					}
					return getCredentials().then(function (credentials) {
						var token = credentials && credentials.token;
						if (socket) { disconnect(); }
						return new Promise(function (accept, reject) {
							switchState(PENDING);
							$log.log('WS connect ', utils.REMOTE_WS_BASE + ' -- ', utils.REMOTE_WS_PATH + '?token=' + token  + '&platform=' + utils.getPlatform().toLocaleLowerCase());
							socket = io.connect(utils.REMOTE_WS_BASE,
								{
									path: utils.REMOTE_WS_PATH,
									query: (token !== undefined ? 'token=' + token : '') + '&platform=' + utils.getPlatform().toLocaleLowerCase(),
									transports: ['websocket'],
									'force new connection':true
								}
							);
							socket.on('connect_error', function (evt) {
								$log.log("SOCKET ERROR :: connection", evt);
								switchState(token ? AUTHED_DISCONNECTED : NOT_AUTHED);
								reject(makeError(0, {message:'unable to connect to socket'}));
							});
							socket.on('connect', function (evt) {
								$log.log("SOCKET :: connection", evt);
								switchState(CONNECTED);
								accept();
							});
							socket.on('disconnect', function (evt) {
								$log.error("SOCKET :: DISCONNECT", evt);
								switchState(token ? AUTHED_DISCONNECTED : NOT_AUTHED);
							});
							socket.on('collection_change', function (event) {
								$log.log('SOCKET :: ONMESSAGE ', event);
								remote.trigger('socket:model', event);
							});
							socket.on('payment_status', function (event) {
								remote.trigger('socket:payment_status', event);
							});
						});
					});
				},
				disconnect = function () {
					// we really don't want to do this
					if (socket) {
						// we really don't wa
						var s = socket.disconnect();
						socket = undefined;
						return s;
					}
				},

				// get subscription information from server, and if offline resort to cached subscription information
				getSubscription = function () {
					return apiRequest({
						url: '/subscription',
						method: 'GET'
					}).then(function (res) {
						// update locally cached subscription info
						var subscription = res.data;
						utils.getFactory('storage').getProfile().then(function (profile) {
							var personal = utils.getModel(profile, 'personal');
							personal.set('lifecourse-subscription', subscription);
							personal.save();
						});
						return subscription;
					}).catch(remote.networkError(), function () {
						// if offline, use locally cached subscription info
						return utils.getFactory('storage').getProfile().then(function (profile) {
							var personal = utils.getModel(profile, 'personal');
							return personal.get('lifecourse-subscription');
						});
					}).then(function (subscription) {
						return _.extend({}, subscription, {
							endString: moment(subscription.end).format('dddd Do MMM YYYY')
						});
					});
				},

				refreshToken = function () { // TODO call this when token will expire
					return apiRequest({
						url: '/auth/token',
						method: 'GET'
					}).then(function (res) {
						return res.data.token;
					});
				};

			var remote = {
				oneTimeToken: function () {
					return apiRequest({
						url: '/auth/token?onetime=true',
						method: 'GET'
					}).then(function (res) {
						return res.data.token;
					});
				},
				/* call these from the login / signup page */
				register: function (email, password) {
					return apiRequest({
						url: '/auth/register',
						method: 'POST',
						requireToken:false,
						data: { email: email, password: password, appId: appConstants.APPID },
						switchState:false
					}).then(function (res) {
						var token = res.data.token;
						$log.log('register() setting token > ', token);
						return setCredentials(email, token).then(function () { return connect(); });
					});
				},

				
				isOnboarded: isOnboarded,
				login: function (email, password) { // alias authLogin
					return apiRequest({
						url: '/auth/login',
						method: 'POST',
						requireToken:false,
						data: { email: email, password: password, appId: appConstants.APPID },
						switchState:false
					}).then(function (res) {
						$log.log('login response > ', res.data);
						var token = res.data.token;
						$log.log('login() setting token > ', token);
						return setCredentials(email, token).then(function () { connect(); });
					});
				},

				// email password reset method
				requestPasswordReset: function (email) { // alias requestPasswordReset
					return apiRequest({
						url: '/auth/request_password_reset',
						method: 'POST',
						data: { email: email },
						switchState:false
					});
				},

				// direct password reset method:
				resetPassword: function (oldpass, newpass) { // alias requestPasswordReset
					return apiRequest({
						url: '/auth/user',
						method: 'PUT',
						data: { currentPassword: oldpass, password:newpass },
						switchState:false
					});
				},

				authed: function () {
					return getCredentials().then(function (credentials) { return credentials !== undefined; });
				},
				getState:function () { return state; },
				connect:connect,
				disconnect:disconnect,
				getSubscription:getSubscription,
				NOT_AUTHED : NOT_AUTHED,
				AUTHED_DISCONNECTED : AUTHED_DISCONNECTED,
				CONNECTED : CONNECTED,
				PENDING : PENDING,
				PAYMENT_NEEDED : PAYMENT_NEEDED,
				getCredentials:getCredentials,
				apiError: function (name) { // error has a name (optionally a specific name)
					return function (error) { return error !== undefined && name ? error.error === name : error && error.error; };
				},
				apiCode: function (code) { // e.g. 401
					return function (error) { return error.code === code; };
				},
				networkError: function () { // error has code 0, -1
					return function (error) { return error !== undefined && error.code <= 0; };
				},
				errorMessage: function () { // any error with a message
					return function (error) { return error !== undefined && error.message !== undefined; };
				},
				apiRequest: apiRequest,
				getConnectedPromise:getConnectedPromise,
				socket: socket
			 };

			var iremote = _.extend(remote, Backbone.Events);

			resetConnectedPromise(); // set initial state of connected promise

			// set initial state
			setTimeout(function () {
				$log.log('connect? ');
				connect().catch(function () {
					$log.error('failed to connect to socket');
				});
			}, 1000);
			return iremote;
		});
})();
