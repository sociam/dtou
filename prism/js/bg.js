/* globals _, chrome, angular */


angular.module('dtouprism').controller('bg', function($scope, storage, utils, dataLayer, $location) {

	console.log('DTOU Prism 1.0!');

	var enabled_prisms = {},
        loading = Promise.resolve(),
		port,
        conf,
		unpackLSArr = (str) => {
			if (str && str.length) { 
				return str.split(',').map((x) => parseInt(x));
			}
			return [];
		},
        setConf = (dict) => {
	        var res;
	        loading = new Promise((resolve, reject) => {res = () => resolve(console.info('configured', conf));});
            return utils.setConf(dict).then(function(updated) {
                conf = updated;
                return dataLayer.init({local: conf.dtou_ctr, endpoint: conf.dtou_router}).then(function () {
                    res();
                    return updated;
                });
            })
        },
        makeHandlers = (port) => ({
            'openTab':(msg) => {
                console.info('got OpenTab message from contentscript >> ', msg);
                chrome.tabs.create(_.pickBy(msg, (v,k) => k !== 'cmd'));
            },
            'get_defs': (msg) => {
                port.postMessage(_.extend(
                    _(msg).chain().clone().extend({ids: unpackLSArr(localStorage[msg.type])}).value(),
                    {token: dataLayer.token}));
            },
            'ask_peer': (msg) => {
                var identifier = dataLayer.extract(msg.payload);
                console.info('>> asking peer for ', conf.dtou_ctr, identifier, conf.dtou_router, msg.payload);
                return dataLayer.askPeer(conf.dtou_ctr, identifier, conf.dtou_router, msg.payload);
            },
            'get_id': (msg) => {
                dataLayer.id(conf.dtou_ctr).then(function(got) {
                    port.postMessage(_.extend(msg, {id: got}));
                    // port.postMessage(_(msg).chain().clone().extend({id: got}).value());
                });
            },
            'get_token': (msg) => {
                port.postMessage(_.extend(msg, {token: dataLayer.token}));
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
        getCollectionWrapped = (name, options) => {
            if(conf.storage_location && !_.get(options, ['override'])){
                // - TODO make this not a hack
                var stripped = conf.storage_location.replace(/^\/|\/$/g, '');
                return storage.getCollection(_.join([stripped, name], '/'), _.omit(options, ['override']));
            }
            return storage.getCollection(name, options);
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
                console.info('>> updated conf', conf);
            }
        }
	});

	chrome.runtime.onConnect.addListener((p) => {
		port = p;
		console.log('connect! ', port);
		var handlers = makeHandlers(port);
		announce = makeAnnounce(port);
		port.onMessage.addListener((msg) => {
            if (msg.cmd && handlers[msg.cmd]) {
                var nonce = msg.cb_nonce;
                loading.then(() => {
                    var result = handlers[msg.cmd](msg);
                    if (result !== undefined && nonce !== undefined) {
                        return result.then === undefined ? Promise.resolve(result) : result;
                    }
                }).then((rdata) => {
                    if(nonce && rdata) port.postMessage({cb_nonce:nonce, data:rdata});
                });
            } else {
                console.error("unknown command ", msg, msg.cmd);
            }
		});
	});

	// - initialise the prism here
	utils.getConf().then(function(res) {
        var defaults = {
            dtou_ctr: utils.dtou_ctr(),
            dtou_router: utils.dtou_router(),
            storage_location: utils.storage_location(),
        };
        return setConf(_.merge(defaults, res));
    }).then(function() {
        console.log('ok');

        // window._utils = utils;
        // exports
        window.getConf = function(){
            // - cached conf to make this faster
            return new Promise.resolve(conf);
        };
        window.setConf = setConf;
        window.getEnabledContentPages = getEnabledContentPages;
        // - wrap the storage shim with remote pdb
        window.getCollectionWrapped = getCollectionWrapped;
        // window.dataLayer = dataLayer;
        // window._st = storage;
    });
});