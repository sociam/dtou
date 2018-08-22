/* globals chrome, $, _ */

// twitter binding script
// some very basic low level jQuerying :)
angular.module('dtouprism').controller('twittercs', ($scope) => {

    console.log('DToU Prism Activated');

    // $('.tweet').find('.context');
    var registered_tweet_ids,
        intersected_tweets,
        profile,
        port,
        token,
        cbHandlers = {},
        domLock = new Promise.resolve(),
        makeAddDToU = (tweet) => {
            return $('<div class="dtou-action-panel"><div class="btn">+</div></div>').on('click',(evt) => {
                // extract id
                var tweetid = $(tweet).data('tweet-id');
                // extract content
                var content = $(tweet).find('.tweet-text')[0].childNodes[0];
                // stop propagation
                evt.stopPropagation();
                port.postMessage({cmd:"make_new_dtou", type:"tweet", tweetid:tweetid, tweetcontent:content});
            });
        },
        openTab = (path, tweet, extras) => {
            // - tells the bg to open a tab with additional data as a b64 encoded json blob
            console.log('extras:', extras)
            port.postMessage({
                cmd: 'openTab',
                url: [path, '?', $.param({id:tweet.id, active:true, encoded:btoa(JSON.stringify(extras))})].join(''),
                active: true
            });
        },
        makeBtn = (id, img) => {
            // - creates token injection buttons on a provided tweetbox id
            return '<span class="TweetBoxExtras-item"><div class="dtou-inject">\n' +
                '  <button class="btn icon-btn js-tooltip dtou-button" id="'+id+'" type="button" style="background-color:transparent" ' +
                'data-delay="150" data-original-title="Insert DToU Identifier"><img src="'+img+'" height="24"/></button></div></span>';
        },
        addButton = () => {
            // - TODO refactor + add buttons to tweet threads + other places
            var img = chrome.extension.getURL('img/prism.png');

            // - create a token injection button the home page tweetbox
            $('.home-tweet-box .TweetBoxToolbar .TweetBoxExtras').append(makeBtn('dtou-button-home', img));
            $('#dtou-button-home').on('click', () => {
                port.postMessage({cmd:'get_id', loc:'#tweet-box-home-timeline'});
            });

            // - and one for the tweet popup
            $('.tweet-box-content .TweetBoxToolbar .TweetBoxExtras').append(makeBtn('dtou-button-popup', img));
            $('#dtou-button-popup').on('click', () => {
                port.postMessage({cmd:'get_id', loc:'*[aria-labelledby="Tweetstorm-tweet-box-0-label Tweetstorm-tweet-box-0-text-label"]'});
            });
        },
        addMenu = (tweet, tweetData) => {
            // - add options on tweet dropdowns for tweets that we own
            let sel = $(tweet).find('.ProfileTweet-action .dropdown-menu ul')[0];
            $(sel).prepend('<li class="dtou-dropdown dropdown-divider"></li>');
            $(`<li class="dtou-dropdown"><button type="button" class="dropdown-link">View/Modify DToU Declarations</button></li>`)
                .on('click', () => {
                    openTab('/create.html', tweetData);
                    $('.dropdown').removeClass('open');
                    return true;
                }).prependTo(sel);
        },
        saveTweet = (twt, options) => {
            // - helper function for keeping tweets in pdb
            console.info('saving tweet >> ', twt);
            port.postMessage({cmd:'save', data: _.extend({type:'tweet'}, twt, options)});
        },
        guid = (len) => {
            // - for message nonces (global message id)
            len = len || 64;
            var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-';
            return Date.now() + '-' + _.range(0,len).map(() => {
                return alpha[Math.floor(Math.random() * alpha.length)];
            }).join('');
        },
        askBg = (data) => {
            return new Promise((acc,rej) => {
                // - registers a handler that resolves this promise when the bg replies
                var nonce = guid();
                cbHandlers[nonce] = (result) => {
                    acc(result);
                    delete cbHandlers[nonce];
                };
                // - passes data blob back to the bg for a reply
                port.postMessage(_.extend({cb_nonce:nonce}, data));
            });
        },
        secondLayerHtml = (definitions, secrets) => {
            // - add our own hidden content + disclaimer, or peer's hidden content + disclaimer
            // - reveal on mouseover (see css)
            var substituted = '';
            if(secrets.substituteHtml){
                substituted += '<div>'+secrets.substituteHtml+'</div>';
            }
            if (definitions.disclaimerHtml){
                substituted += '<br/><div><small><i>Disclaimer: '+definitions.disclaimerHtml+'</i></small></div>'
            }
            return substituted;
        },
        augment = (tweet, data, cb) => {
            // - this method augments our tweets with hidden content + menus
            // - get stored tweets for ourselves
            askBg({cmd:'get_model', id:data.id}).then((response) => {
                // - an enhanced tweet <--> has hidden content
                if (!response.data.dtou) return;
                if (response.data.dtou.definitions.substitute) {
                    var things = $(tweet).find('.js-tweet-text-container p').clone();
                    $(tweet).find('.js-tweet-text-container p').addClass('firstLayer');
                    things.addClass('secondLayer');
                    window._tweet = tweet;
                    window.things = things;
                    // - inject the hidden content (might be a reject notice if peer denies dtou agreement)
                    let substituted = secondLayerHtml(response.data.dtou.definitions, response.data.dtou.secrets);
                    $(things).html(substituted);
                    $(tweet).find('.js-tweet-text-container').append(things);
                }
            }).then((res) => {
                if (cb && typeof cb === 'function') cb();
                return res;
            });
        },
        addMenuAndAugmentOther = (tweet, tweetData, cb) => {
            // - this method augments a peer's tweet w/ its dtou and, if released, its hidden content
            // - we execute two promises in parallel:
            //   1. get stored agreements/peer dtous for review (from pdb)
            //   2. ask peer for their hidden content with existing agreements (with telehash)
            var got_model = askBg({cmd:'get_model', id:tweetData.id});
            var peer_resp = got_model.then((got) => {
                var payload = _.merge((got.data) ? got.data : tweetData, {id:tweetData.id});
                console.info('asking for', payload);
                return askBg({cmd:'ask_peer', id:tweetData.id, payload:payload});
            });
            return Promise.all([got_model, peer_resp]).then((pair) => {
                // - separate the two promise results
                var mySavedData = pair[0],
                    peerData = pair[1];

                // - check that we haven't augmented the tweet already
                if ($(tweet).find('li.dtou-dropdown').length === 0) {
                    console.info('>> got peer dtou', peerData.data);
                    let sel = $(tweet).find('.ProfileTweet-action .dropdown-menu ul')[0];
                    $(sel).prepend('<li class="dtou-dropdown dropdown-divider"></li>');
                    // - add menu for recognising peer dtou user (assigning roles; permissions.js)
                    let recognise = $('<li class="dtou-dropdown"><button type="button" class="dropdown-link">Recognise User as a Peer</button></li>');
                    // - add menu for reviewing + accepting dtous (other.js)
                    let btn = $('<li class="dtou-dropdown"><button type="button" class="dropdown-link">View and Accept Peer DToUs</button></li>');
                    // - this just notifies user if we couldnt talk to the peer
                    if (!peerData.data || peerData.data.error) {
                        [btn, recognise].map((item) => {
                            item.find('button')
                                .addClass('js-tooltip')
                                .attr('data-original-title', 'connection error; check DToU settings')
                                .attr('data-delay', '0');
                            item.on('mouseenter', () => {
                                item.find('button').addClass('in');
                                return true;
                            }).on('mouseleave', () => {
                                item.find('button').removeClass('in');
                                return true;
                            }).prependTo(sel);
                        });
                    } else {
                        // - we're the consumer; open UIs from our perspective
                        let consumer = {
                            twitter: {
                                author:profile.screenName,
                                authorid:profile.userId
                            }
                        };
                        btn.on('click', () => {
                            openTab('/other.html', tweetData, _.extend(peerData.data, {consumer:consumer}));
                            $('.dropdown').removeClass('open');
                            return true;
                        }).prependTo(sel);
                        recognise.on('click', () => {
                            openTab('/permissions.html', tweetData, _.extend(peerData.data, {consumer:consumer}));
                            $('.dropdown').removeClass('open');
                            return true;
                        }).prependTo(sel);
                    }

                    // - augment tweet with returned dtou data
                    if (mySavedData.data.agreement && _.get(peerData, ['data','dtou','secrets'])) {
                        var things = $(tweet).find('.js-tweet-text-container p').clone();
                        $(tweet).find('.js-tweet-text-container p').addClass('firstLayer');
                        things.addClass('secondLayer');
                        window._tweet = tweet;
                        window.things = things;
                        let substituted = secondLayerHtml(peerData.data.dtou.definitions, peerData.data.dtou.secrets);
                        $(things).html(substituted);
                        $(tweet).find('.js-tweet-text-container').append(things);
                    }
                }
                return peerData;
            }).then((res) => {
                if(cb && typeof cb === 'function') cb();
                return res;
            });
        },
        extractTweet = (tweetDOM) => {
            // - convenience method for getting the info out of tweets
            return {
                id:'tweet-'+$(tweetDOM).data('tweet-id'),
                type:'tweet',
                authorid: $(tweetDOM).data('user-id'),
                author: $(tweetDOM).data('screen-name'),
                mentions:$(tweetDOM).data('mentions'),
                text:$(tweetDOM).find('.js-tweet-text-container').text(),
                html:$(tweetDOM).find('.js-tweet-text-container')[0].innerHTML,
                twitterId:$(tweetDOM).data('tweet-id'),
                conversationId:$(tweetDOM).data('conversation-id')
            };
        },
        update_dom = () => {
            // - this looks through the twitter UI and uses the above methods to add menus/btns/hidden content
            var res;
            domLock.then(() => {
                if (profile === undefined) profile = extract_profile();
                // find my own tweets
                var res2,
                    augmenting = new Set(),
                    augLock = new Promise((resolve, reject) => {res2 = resolve}),
                    rm = (id) => {
                        augmenting.delete(id);
                        if(augmenting.size == 0) res2();
                    },
                    // - convenience methods for finding our and our peers' tweets
                    findMine = () => {
                        return $(this).data('screen-name') === profile.screenName;
                    },
                    findOthers = () => {
                        return $(this).data('screen-name') != profile.screenName &&
                            $(this).find('.js-tweet-text-container').text().indexOf(token) >= 0;
                    };

                $('.tweet').filter(findMine)
                    .addClass('mine')
                    .map((x, tweet) => {
                        // - check this hasn't been already augmented
                        if ($(tweet).find('li.dtou-dropdown').length === 0) {
                            var tweetData = extractTweet(tweet);
                            augmenting.add(tweetData.id);
                            saveTweet(tweetData, {mine:true});
                            addMenu(tweet, tweetData);
                            augment(tweet, tweetData, () => {rm(tweetData.id)});
                        }
                    });

                // - find tweets with dtou augmentation
                $('.tweet').filter(findOthers)
                    .map((x, tweet) => {
                        // - a little more complicated, 2nd check for augmentation done
                        //   within addMenuAndAugmentOther
                        if ($(tweet).find('li.dtou-dropdown').length === 0) {
                            var tweetData = extractTweet(tweet);
                            augmenting.add(tweetData.id);
                            saveTweet(tweetData, {mine:false});
                            addMenuAndAugmentOther(tweet, tweetData, () => {rm(tweetData.id)});
                        }
                    });
                augLock.then(() => {if(res) res()});
            });
        },
        setTweetIds = (ids) => {
            registered_tweet_ids = ids;
        },
        extract_profile = () => {
            return JSON.parse($("#init-data").attr('value'));
        };

    var init = () => {
        // connect to the back-end; bg has onConnect listener for receiving messages from this tab
        port = chrome.runtime.connect();
        $('#timeline').bind('DOMSubtreeModified', (e) => {
            if (e.target.innerHTML.indexOf('"tweet ') >= 0) {
                update_dom();
            }
        });
        // - hook this page up to the bg
        port.onMessage.addListener((msg) => {
            // - unblocks promises that are waiting for the bg central handlers
            if (msg.cb_nonce && cbHandlers[msg.cb_nonce]) {
                return cbHandlers[msg.cb_nonce](msg);
            }
            if (msg.cmd === 'get_id') {
                $(msg.loc).removeClass('is-showPlaceholder');
                $(msg.loc + ' > div').prepend(msg.id+'\n');
                return;
            }
            if (msg.cmd === 'get_defs' && msg.type == 'tweet') {
                setTweetIds(msg.ids);
                token = msg.token;
                return update_dom();
            }

            console.error("unknown message", msg, cbHandlers);
        });
        port.postMessage({cmd:'get_defs', type:'tweet'});
        port.onDisconnect.addListener((e) => {
            console.error('>> port disconnected', e);
        });
        addButton();
    };

    init();
});

// - we dont load other angular modules on the twitter page, so just attach this script
//   to a dummy element
$('html').append('<div id="dtouPrism" ng-app="dtouprism" ng-controller="twittercs"></div>');
var rootEle = $(this).find('#dtouPrism');
angular.bootstrap(rootEle);