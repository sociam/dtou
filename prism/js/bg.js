/* globals _, chrome, angular */


angular.module('dtouprism').controller('bg', function($scope, storage, utils) {

	console.log('DTOU Prism 1.0!');

	var enabled_prisms = {},
		port,
		unpackLSArr = (str) => {
			if (str && str.length) { 
				return str.split(',').map((x) => parseInt(x));
			}
			return [];
		}, makeHandlers = (port) => ({
			'openTab':(msg) => {
				console.log('got OpenTab message from contentscript >> ', msg);
				chrome.tabs.create(_.pickBy(msg, (v,k) => k !== 'cmd'));
			},
			'get_defs': (msg) => { 
			   port.postMessage(_(msg).chain().clone().extend({ids: unpackLSArr(localStorage[msg.type])}).value());
			},
			'make_new_dtou': (itemspec) => {
			    // chrome.tabs.create({ url: chrome.extension.getURL('create.html') + '?' + jQuery.params(itemspec) });
			},
			'save': (o) => {
				storage.getCollection('items').then((collection) => {
					var m = collection.get(""+o.data.id);
					// console.log('yo .. ', m);
					if (m === undefined) {
						console.log('making with id ', o.data.id);
						var ofilter = _.pickBy(o.data, (v,k) => { 
							console.log('v k ', v, k);
							return k !== 'id';
						});
						console.log('ofilter ', ofilter);
						m = collection.make(""+o.data.id);
						m.set(ofilter);
						m.save().then(() => {
							console.log(`saved ${o.data.type} : `, m);
						}).catch((e) => {
							console.error(`Error saving ${o.data.id} - ${e.toString()}`);
						});
					}
				});
			}
		}), setEnableContentPage = (page,val) => {
			console.log('setting ', page, ' to ', val);
			enabled_prisms[page] = val;
			announce({type:'event', evt:'togglecp', page:page, val: val });
		}, getEnabledContentPages = () => enabled_prisms,
		announce,
		makeAnnounce = (port) => {
			return (obj) => port.postMessage(obj);
		};

	chrome.runtime.onConnect.addListener((p) => {
		port = p;
		console.log('connect! ', port);
		var handlers = makeHandlers(port);
		announce = makeAnnounce(port);
		port.onMessage.addListener((msg) => { 
			console.info('message ', msg);
			if (msg.cmd && handlers[msg.cmd]) { 
				handlers[msg.cmd](msg);
			} else {
				console.error("unknown command ", msg, msg.cmd);
			}
		});
	});

	console.log('ok');

	// window._utils = utils;

	// exports
	window._st = storage;


});