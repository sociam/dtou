
angular.module('dtouprism', [])
	.constant('appConstants', {	APPNAME: 'DTOUPrism', APPID: 'dtou'	})
	.config(function ($provide) {
			$provide.decorator('$log', function ($delegate) {
				$delegate.instance = function (name, color) {
					var $log = {},
						disable;
					['log', 'info', 'warn', 'error', 'debug'].forEach(function (method) {
						$log[method] = function () {
							if (disable) { return; }
							var args = Array.prototype.slice.call(arguments);
							args.unshift('%c' + name, 'border-radius:3px;padding:2px 3px;font-weight:900;font-size:0.8em;text-transform:uppercase;color:white;background-color: ' + color);
							$delegate[method].apply(null, args);
						};
					});
					$log.disable = function () {
						disable = true;
						return $log;
					};
					return $log;
				};
				return $delegate;
			});
		});

