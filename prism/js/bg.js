/* globals _, chrome, angular */


angular.module('dtouprism').controller('bg', function($scope, storage, utils) {

	console.log('DTOU Prism 1.0!');

	var enabled_prisms = {},
		unpackLSArr = (str) => {
			if (str && str.length) { 
				return str.split(',').map((x) => parseInt(x));
			}
			return [];
		}, makeHandlers = (port) => ({
			'get_defs': (msg) => { 
			   port.postMessage(_(msg).chain().clone().extend({ids: unpackLSArr(localStorage[msg.type])}).value());
			},
			'make_new_dtou': (itemspec) => {
			    // chrome.tabs.create({ url: chrome.extension.getURL('create.html') + '?' + jQuery.params(itemspec) });
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

	chrome.runtime.onConnect.addListener((port) => {
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
	window._st = storage;

});