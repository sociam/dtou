/* globals chrome, $, _ */


// console.log('hello from content script', $('.tweet').length, $('.tweet'));

// twitter content script
// some very basic low level jQuerying :) 

console.log('DToU Prism Activated');

// $('.tweet').find('.context');
var registered_tweet_ids,
	intersected_tweets,
	profile,
	port,
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
	update_dom = () => {
		if (profile === undefined) { profile = extract_profile(); }

		// visible tweets ...
		// var visible_tweets = $('.tweet').map((x,y) => parseInt($(y).attr('data-tweet-id')));
		// intersected_tweets = _.intersection(visible_tweets, registered_tweet_ids);

		// find my own tweets
		console.log('seeking ', profile.screenName, 'owned tweets :',$('.tweet').filter(function() {  return $(this).data('screen-name') === profile.screenName; }).length);
		$('.tweet').filter(function() {  return $(this).data('screen-name') === profile.screenName; })
			.map((x,tweet) => {
				if ($(tweet).find('.dtou-action-panel').length === 0) { 
					// add it! 
					$(tweet).find('.context').append(makeAddDToU(tweet));
				}
			});

	}, setTweetIds = (ids) => {
		registered_tweet_ids = ids;
	}, extract_profile = () => {
		return JSON.parse($("#init-data").attr('value'));
	};

var init = () => {
	// connect to the back-end
	port = chrome.runtime.connect();	
	port.postMessage({cmd:'get_defs', type:'tweet'});
	port.onMessage.addListener(function(msg) {
		// console.log('on message ', msg);
		if (msg.cmd === 'get_defs' && msg.type == 'tweet') {
			setTweetIds(msg.ids);
		} else {
			console.error("unknown message", msg);
		} 
	  	update_dom();
	});	
	$('#timeline').bind('DOMSubtreeModified', function(e) {
	  if (e.target.innerHTML.length > 0) { update_dom(); }
	});
};

init();

