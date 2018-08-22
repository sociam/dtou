/* globals _, chrome, angular */

angular.module('dtouprism').controller('bg', ($scope, storage, utils, dataLayer, $location) => {

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
        // - set a dictionary of configurations into chrome memory using utils
        // - also blocks the extension until we've loaded the confs
	        var res;
	        loading = new Promise((resolve, reject) => {res = () => resolve(console.info('configured', conf));});
            return utils.setConf(dict).then((updated) => {
                conf = updated;
                // - point the node js app to the right telehash router
                return dataLayer.init({local: conf.dtou_ctr, endpoint: conf.dtou_router}).then(() => {
                    res();
                    return updated;
                });
            })
        },
        makeHandlers = (port) => ({
            // - handler for incoming messages to the bg
            'openTab':(msg) => {
                console.info('got OpenTab message from contentscript >> ', msg);
                chrome.tabs.create(_.pickBy(msg, (v,k) => k !== 'cmd'));
            },
            'get_defs': (msg) => {
                // - this gets DTOU definitions and our current telehash token (hashname)
                port.postMessage(_.extend(
                    _(msg).chain().clone().extend({ids: unpackLSArr(localStorage[msg.type])}).value(),
                    {token: dataLayer.token}));
            },
            'ask_peer': (msg) => {
                // - invoke RPC on node application to ask a peer for data
                // - sends location of node (dtou_ctr), identifier (peer hashname), dtou_router on public
                //   internet, and json payload
                var identifier = dataLayer.extract(msg.payload);
                console.info('>> asking peer for ', conf.dtou_ctr, identifier, conf.dtou_router, msg.payload);
                return dataLayer.askPeer(conf.dtou_ctr, identifier, conf.dtou_router, msg.payload);
            },
            'get_id': (msg) => {
                // - gets our hashname from the node app
                dataLayer.id(conf.dtou_ctr).then((got) => {
                    port.postMessage(_.extend(msg, {id: got}));
                });
            },
            'getAcls': (msg) => {
                // - gets acls from the node app
                return dataLayer.getAcls(conf.dtou_ctr);
            },
            'get_token': (msg) => {
                // - get our thjs token
                port.postMessage(_.extend(msg, {token: dataLayer.token}));
            },
            'get_model': (id) => {
                // - get anything from pdb (using backbone)
                return getCollectionWrapped('items').then((collection) => {
                    return collection.get(id);
                });
            },
            'save': (o) => {
                // - update backbone model, which will sync with pdb and :. cdb
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
	        // - point extension to a cdb instance (in docker), otherwise default to chrome storage
            if(conf.storage_location && !_.get(options, ['override'])){
                var stripped = conf.storage_location.replace(/^\/|\/$/g, '');
                return storage.getCollection(_.join([stripped, name], '/'), _.omit(options, ['override']));
            }
            return storage.getCollection(name, options);
        },
        announce,
        makeAnnounce = (port) => {
            return (obj) => port.postMessage(obj);
        };

	chrome.storage.onChanged.addListener((changes, namespace) => {
	    // - update configurations whenever some other page changes it (e.g. popup)
        for (key in changes) {
            if (key === 'dtouprism_conf'){
                var updated = changes[key];
                conf = updated.newValue;
                console.info('>> updated conf', conf);
            }
        }
	});

	chrome.runtime.onConnect.addListener((p) => {
	    // - register separate handler instances for separate pages
		port = p;
		console.log('connect! ', port);
		var handlers = makeHandlers(port);
		announce = makeAnnounce(port);
		port.onMessage.addListener((msg) => {
            if (msg.cmd && handlers[msg.cmd]) {
                var nonce = msg.cb_nonce;
                loading.then(() => {
                    var result = handlers[msg.cmd](msg);
                    // - this is used specifically for bindings, which has convenience methods w/ nonces
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

	// - initialise the prism with our confs
	utils.getConf().then((res) => {
        var defaults = {
            dtou_ctr: utils.dtou_ctr(),
            dtou_router: utils.dtou_router(),
            storage_location: utils.storage_location(),
        };
        return setConf(_.merge(defaults, res));
    }).then(() => {
        console.log('ok');

        // export functions for getBackgroundPage invocations
        window.getConf = () => {
            // - cached conf to make this faster
            return new Promise.resolve(conf);
        };
        window.setConf = setConf;
        window.getEnabledContentPages = getEnabledContentPages;
        // - wrap the storage shim with remote pdb
        window.getCollectionWrapped = getCollectionWrapped;
        window.getAcls = () => {
            return dataLayer.getAcls(conf.dtou_ctr);
        };
        window.setAcls = (acls) => {
            return dataLayer.setAcls(conf.dtou_ctr, acls);
        };
        window.deleteAcls = (acls) => {
            return dataLayer.deleteAcls(conf.dtou_ctr, acls);
        };
        window.extract = dataLayer.extract;
    });
});