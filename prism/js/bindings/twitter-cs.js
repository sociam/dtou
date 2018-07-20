/* globals chrome, $, _ */


// console.log('hello from content script', $('.tweet').length, $('.tweet'));

// twitter content script
// some very basic low level jQuerying :)
// read this https://developer.chrome.com/extensions/messaging

angular.module('dtouprism').controller('twittercs', function($scope) {

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
                // console.log('ihtml', tweet, $(tweet).find('.tweet-text')[0].childNodes[0]);
                var content = $(tweet).find('.tweet-text')[0].childNodes[0];
                // stop propagation
                evt.stopPropagation();
                port.postMessage({cmd:"make_new_dtou", type:"tweet", tweetid:tweetid, tweetcontent:content});
            });
        },
        openTab = (path, tweet, extras) => {
            console.log('extras:', extras)
            port.postMessage({
                cmd: 'openTab',
                // url: [path, '?', $.param(_.extend({id:tweet.id, active:true}, extras))].join(''),
                url: [path, '?', $.param({id:tweet.id, active:true, encoded:btoa(JSON.stringify(extras))})].join(''),
                active: true
            });
        },
        makeBtn = (id, img) => {
            return '<span class="TweetBoxExtras-item"><div class="dtou-inject">\n' +
                '  <button class="btn icon-btn js-tooltip dtou-button" id="'+id+'" type="button" style="background-color:transparent" ' +
                'data-delay="150" data-original-title="Insert DToU Identifier"><img src="'+img+'" height="24"/></button></div></span>';
        },
        addButton = () => {
            // - TODO refactor + add buttons to replies
            var img = chrome.extension.getURL('img/prism.png');

            $('.home-tweet-box .TweetBoxToolbar .TweetBoxExtras').append(makeBtn('dtou-button-home', img));
            $('#dtou-button-home').on('click', function() {
                port.postMessage({cmd:'get_id', loc:'#tweet-box-home-timeline'});
            });
            $('.tweet-box-content .TweetBoxToolbar .TweetBoxExtras').append(makeBtn('dtou-button-popup', img));
            $('#dtou-button-popup').on('click', function() {
                port.postMessage({cmd:'get_id', loc:'*[aria-labelledby="Tweetstorm-tweet-box-0-label Tweetstorm-tweet-box-0-text-label"]'});
            });
        },
        addMenu = (tweet, tweetData) => {
            let sel = $(tweet).find('.ProfileTweet-action .dropdown-menu ul')[0];
            $(sel).prepend('<li class="dtou-dropdown dropdown-divider"></li>');
            // $('<li class="dtou-dropdown"><button type="button" class="dropdown-link">View DToU Status</button></li>')
            //     .on('click', function() { console.log('view status'); openTab('/edit.html', tweetData); $('.dropdown').removeClass('open'); return true; })
            //     .prependTo(sel);
            $(`<li class="dtou-dropdown"><button type="button" class="dropdown-link">View/Modify DToU Declarations</button></li>`)
                .on('click', function() {
                    openTab('/create.html', tweetData);
                    $('.dropdown').removeClass('open');
                    return true;
                }).prependTo(sel);
        },
        saveTweet = (twt, options) => {
            console.info('saving tweet >> ', twt);
            port.postMessage({cmd:'save', data: _.extend({type:'tweet'}, twt, options)});
        },
        guid = function(len) {
            len = len || 64;
            var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-';
            return Date.now() + '-' + _.range(0,len).map(function () {
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
        augment = (tweet, data, cb) => {
            askBg({cmd:'get_model', id:data.id}).then((response) => {
                // - TODO put this whole blob into dtou_handlers/twitter.js
                // console.log('askBG get response!!!  >> ', response.data, response.data.dtou);
                if (!response.data.dtou) return;
                // - content substitution dtou
                if (response.data.dtou.definitions.substitute) {
                    var things = $(tweet).find('.js-tweet-text-container p').clone();
                    $(tweet).find('.js-tweet-text-container p').addClass('firstLayer');
                    things.addClass('secondLayer');
                    // console.log('askBG >> ', {cmd: 'get_model', id: data.id});
                    window._tweet = tweet;
                    // window._response = response;
                    window.things = things;
                    $(things).html(response.data.dtou.secrets.substituteHtml);
                    $(tweet).find('.js-tweet-text-container').append(things);
                    // $($(tweet).find('.js-tweet-text-container p')[0]).hide();
                }
            }).then((res) => {
                if (cb && typeof cb === 'function') cb();
                return res;
            });
        },
        addMenuAndAugmentOther = (tweet, tweetData, cb) => {
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

                if ($(tweet).find('li.dtou-dropdown').length === 0) {
                    console.info('>> got peer dtou', peerData.data);
                    let sel = $(tweet).find('.ProfileTweet-action .dropdown-menu ul')[0];
                    $(sel).prepend('<li class="dtou-dropdown dropdown-divider"></li>');
                    // - add menu for recognising peer dtou user
                    let recognise = $('<li class="dtou-dropdown"><button type="button" class="dropdown-link">Recognise DToU User</button></li>');
                    // - add menu for accepting dtous
                    let btn = $('<li class="dtou-dropdown"><button type="button" class="dropdown-link">View Peer DToUs</button></li>');
                    if (!peerData.data || peerData.data.error) {
                        [btn, recognise].map((item) => {
                            item.find('button')
                                .addClass('js-tooltip')
                                .attr('data-original-title', 'connection error; check DToU settings')
                                .attr('data-delay', '0');
                            item.on('mouseenter', function () {
                                item.find('button').addClass('in');
                                return true;
                            }).on('mouseleave', function () {
                                item.find('button').removeClass('in');
                                return true;
                            }).prependTo(sel);
                        });
                    } else {
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
                        // window._response = peerData;
                        window.things = things;
                        $(things).html(peerData.data.dtou.secrets.substituteHtml);
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
            // var decoded = $(tweetDOM).data('') && JSON.parse($(tweetDOM)
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
            var res;
            domLock.then(() => {
                // - TODO the mutex doesn't actually work -- figure this out later
                // console.info('updating dom');
                // domLock = new Promise((resolve, reject) => {res = () => resolve(console.info('updated dom'));});
                if (profile === undefined) profile = extract_profile();
                console.log('profile', profile);

                // visible tweets ...
                // var visible_tweets = $('.tweet').map((x,y) => parseInt($(y).attr('data-tweet-id')));
                // intersected_tweets = _.intersection(visible_tweets, registered_tweet_ids);

                // find my own tweets
                // console.log('seeking ', profile.screenName, 'owned tweets :',$('.tweet').filter(function() {  return $(this).data('screen-name') === profile.screenName; }).length);
                var res2,
                    augmenting = new Set(),
                    augLock = new Promise((resolve, reject) => {res2 = resolve}),
                    rm = (id) => {
                        augmenting.delete(id);
                        if(augmenting.size == 0) res2();
                    },
                    findMine = function () {
                        return $(this).data('screen-name') === profile.screenName;
                    },
                    findOthers = function () {
                        return $(this).data('screen-name') != profile.screenName &&
                            $(this).find('.js-tweet-text-container').text().indexOf(token) >= 0;
                    };

                $('.tweet').filter(findMine)
                    .addClass('mine')
                    .map((x, tweet) => {
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

        $('#timeline').bind('DOMSubtreeModified', function(e) {
            if (e.target.innerHTML.indexOf('"tweet ') >= 0) {
                update_dom();
            }
            //  if (e.target.innerHTML.length > 0) { update_dom(); }
        });

        port.onMessage.addListener(function(msg) {
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
        port.onDisconnect.addListener(function(e) {
            console.error('>> port disconnected', e);
        });
        addButton();
    };

    init();
});

// - couldnt find a better way of doing this
$('html').append('<div id="dtouPrism" ng-app="dtouprism" ng-controller="twittercs"></div>');
var rootEle = $(this).find('#dtouPrism');
angular.bootstrap(rootEle);