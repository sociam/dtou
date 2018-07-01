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
        cbHandlers = {},
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
        openTab = (path, tweet) => {
            port.postMessage({cmd:'openTab', url:[path, '?', $.param({id:tweet.id, active:true})].join(''), active:true });
        },
        addMenu = (tweet, tweetData) => {
            let sel = $(tweet).find('.ProfileTweet-action .dropdown-menu ul')[0];
            $(sel).prepend('<li class="dtou-dropdown dropdown-divider"></li>');
            $('<li class="dtou-dropdown"><button type="button" class="dropdown-link">View DToU Status</button></li>')
                .on('click', function() { console.log('view status'); openTab('/edit.html', tweetData); $('.dropdown').removeClass('open'); return true; })
                .prependTo(sel);
            $(`<li class="dtou-dropdown"><button type="button" class="dropdown-link">Create DToU Declaration</button></li>`)
                .on('click', function() { console.log('click create dtou '); openTab('/create.html', tweetData);  $('.dropdown').removeClass('open');  return true; })
                .prependTo(sel);
        },
        saveTweet = (twt) => {
            console.log('saving tweet >> ', twt);
            port.postMessage({cmd:'save', data: _.extend({type:'tweet'}, twt)});
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
        augment = (tweet, data) => {
            askBg({cmd:'get_model', id:data.id}).then((response) => {
                // - TODO put this whole blob into dtou_handlers/twitter.js
                // console.log('askBG get response!!!  >> ', response.data, response.data.dtou);
                if (!response.data.dtou) return;
                // - content substitution dtou
                if (response.data.dtou.substitute) {
                    var things = $(tweet).find('.js-tweet-text-container p').clone();
                    $(tweet).find('.js-tweet-text-container p').addClass('firstLayer');
                    things.addClass('secondLayer');
                    console.log('askBG >> ', {cmd: 'get_model', id: data.id});
                    window._tweet = tweet;
                    window._response = response;
                    window.things = things;
                    $(things).html(response.data.dtou.substituteHtml);
                    $(tweet).find('.js-tweet-text-container').append(things);
                    // $($(tweet).find('.js-tweet-text-container p')[0]).hide();
                }
                // - pingback dtou
                if (response.data.dtou.pingback) {

                }
            });
        },
        extractTweet = (tweetDOM) => {
            // var decoded = $(tweetDOM).data('') && JSON.parse($(tweetDOM)
            return {
                id:'tweet-'+$(tweetDOM).data('tweet-id'),
                twitterId:$(tweetDOM).data('tweet-id'),
                type:'tweet',
                conversationId:$(tweetDOM).data('conversation-id'),
                authorid: $(tweetDOM).data('user-id'),
                author: $(tweetDOM).data('screen-name'),
                mentions:$(tweetDOM).data('mentions'),
                text:$(tweetDOM).find('.js-tweet-text-container').text(),
                html:$(tweetDOM).find('.js-tweet-text-container')[0].innerHTML
            };
        },
        update_dom = () => {
            if (profile === undefined) { profile = extract_profile(); }

            // visible tweets ...
            // var visible_tweets = $('.tweet').map((x,y) => parseInt($(y).attr('data-tweet-id')));
            // intersected_tweets = _.intersection(visible_tweets, registered_tweet_ids);

            // find my own tweets
            // console.log('seeking ', profile.screenName, 'owned tweets :',$('.tweet').filter(function() {  return $(this).data('screen-name') === profile.screenName; }).length);
            $('.tweet').filter(function() { return $(this).data('screen-name') === profile.screenName; })
                .addClass('mine')
                .map((x,tweet) => {
                    if ($(tweet).find('li.dtou').length === 0) {
                        var tweetData = extractTweet(tweet);
                        saveTweet(tweetData);
                        addMenu(tweet, tweetData);
                        augment(tweet, tweetData);
                    }
                });

        }, setTweetIds = (ids) => {
            registered_tweet_ids = ids;
        }, extract_profile = () => {
            return JSON.parse($("#init-data").attr('value'));
        };

    var init = () => {
        // connect to the back-end; bg has onConnect listener for receiving messages from this tab
        port = chrome.runtime.connect();
        port.postMessage({cmd:'get_defs', type:'tweet'});
        port.onMessage.addListener(function(msg) {
            // - unblocks promises that are waiting for the bg central handlers
            if (msg.cb_nonce && cbHandlers[msg.cb_nonce]) {
                return cbHandlers[msg.cb_nonce](msg);
            }
            if (msg.cmd === 'get_defs' && msg.type == 'tweet') {
                setTweetIds(msg.ids);
                return update_dom();
            }

            console.error("unknown message", msg);
        });
        port.onDisconnect.addListener(function(e) {
            console.error('>> port disconnected', e);
        });
        $('#timeline').bind('DOMSubtreeModified', function(e) {
            if (e.target.innerHTML.indexOf('"tweet ') >= 0) {
                update_dom();
            }
            //  if (e.target.innerHTML.length > 0) { update_dom(); }
        });
    };

    init();
});

// - couldnt find a better way of doing this
$('html').append('<div id="dtouPrism" ng-app="dtouprism" ng-controller="twittercs"></div>');
var rootEle = $(this).find('#dtouPrism');
angular.bootstrap(rootEle);