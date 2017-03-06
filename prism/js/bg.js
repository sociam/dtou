/* globals _, chrome */

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
		}
	}), setEnableContentPage = (page,val) => {
		console.log('setting ', page, ' to ', val);
		enabled_prisms = val;
	}, getEnabledContentPages = () => enabled_prisms;



chrome.runtime.onConnect.addListener((port) => {
	console.log('connect! ', port);
	var handlers = makeHandlers(port);
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