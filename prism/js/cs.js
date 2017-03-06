/* globals chrome, $ */


// console.log('hello from content script', $('.tweet').length, $('.tweet'));

// some very basic low level jQuerying :) 
console.log('DToU Prism Activated');
$('.tweet').find('.context');

var registered_tweet_ids,
	intersected_tweets,
	recompute = () => {
		var visible_tweets = $('.tweet').map((x,y) => parseInt($(y).attr('data-tweet-id')));
		intersected_tweets = _.intersection(visible_tweets, registered_tweet_ids);
		console.info('intersection > ', intersected_tweets);
	}, setTweetIds = (ids) => {
		console.info('updating registered tweets', ids);
		registered_tweet_ids = ids;
	};

var init = () => {
	// connect to the back-end
	var port = chrome.runtime.connect();	
	port.postMessage({cmd:'get_defs', type:'tweet'});
	port.onMessage.addListener(function(msg) {
		console.log('on message ', msg);
		if (msg.cmd === 'get_defs' && msg.type == 'tweet') {
			setTweetIds(msg.ids);
		} else {
			console.error("unknown message", msg);
		} 
	  	recompute();
	});	
	$('#timeline').bind('DOMSubtreeModified', function(e) {
	  if (e.target.innerHTML.length > 0) {
	    console.log('subtree modified');
	  	recompute();
	  }
	});
};

init();

