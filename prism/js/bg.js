/* globals _, chrome, angular */


angular.module('dtouprism').controller('bg', function($scope, storage, utils, data, $location) {

	console.log('DTOU Prism 1.0!');

	var enabled_prisms = {},
		port,
        conf,
		unpackLSArr = (str) => {
			if (str && str.length) { 
				return str.split(',').map((x) => parseInt(x));
			}
			return [];
		},
        makeHandlers = (port) => ({
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
			'get_model': (id) => {
				return getCollectionWrapped('items').then((collection) => {
					return collection.get(id);
				});
			},
			'save': (o) => {
				getCollectionWrapped('items').then((collection) => {
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
		}),
        setEnableContentPage = (page,val) => {
			console.log('setting ', page, ' to ', val);
			enabled_prisms[page] = val;
			announce({type:'event', evt:'togglecp', page:page, val: val });
		},
        getEnabledContentPages = () => enabled_prisms,
        getCollectionWrapped = (name, override) => {
	        if(conf.storage_location && !override){
	            // - TODO make this not a hack
                var stripped = conf.storage_location.replace(/^\/|\/$/g, '');
	            return storage.getCollection(_.join([stripped, name], '/'));
            }
	        return storage.getCollection(name);
        },
		announce,
		makeAnnounce = (port) => {
			return (obj) => port.postMessage(obj);
		};

	chrome.storage.onChanged.addListener(function(changes, namespace) {
        for (key in changes) {
            if (key === 'dtouprism_conf'){
                var updated = changes[key];
                conf = updated.newValue;
                console.log('>> updated conf', conf);
            }
        }
	});

	chrome.runtime.onConnect.addListener((p) => {
		port = p;
		console.log('connect! ', port);
		var handlers = makeHandlers(port);
		announce = makeAnnounce(port);
		port.onMessage.addListener((msg) => { 
			console.info('message ', msg);
			if (msg.cmd && handlers[msg.cmd]) { 
				var nonce = msg.cb_nonce,
					result = handlers[msg.cmd](msg);

				if (result !== undefined && nonce !== undefined) {
					var rp = result.then === undefined ? Promise.resolve(result) : result;
					rp.then((rdata) => {
						port.postMessage({cb_nonce:nonce, data:rdata});
					});
				}
			} else {
				console.error("unknown command ", msg, msg.cmd);
			}
		});
	});

	utils.getConf().then(function(res){
	    var defaults = {
            dtou_ctr: utils.dtou_ctr(),
            dtou_router: utils.dtou_router(),
            storage_location: utils.storage_location(),
        };
	    utils.setConf(_.merge(defaults, res)).then(function(updated){
	        conf = updated;
            console.log('loaded conf', updated);
        });
    });

	console.log('ok');

	// window._utils = utils;

	// exports
    window.getConf = function(){
        // - cached conf to make this faster
        return new Promise(function(resolve, reject){resolve(conf)});
    };
    window.setConf = utils.setConf;
    window.getEnabledContentPages = getEnabledContentPages;
    // - wrap the storage shim with remote pdb
    window.getCollectionWrapped = getCollectionWrapped;
	// window._st = storage;

});