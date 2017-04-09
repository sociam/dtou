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
	openTab = (path, tweet) => {
		port.postMessage({cmd:'openTab', url:[path, '?', $.param({id:tweet.id, active:true})].join(''), active:true });
	},
	sneakAdd = (tweet, tweetData) => {
		console.log('hi - ', tweet);
		let sel = $(tweet).find('.ProfileTweet-action .dropdown-menu ul')[0];
		$(sel).prepend('<li class="dtou-dropdown dropdown-divider"></li>');
		$('<li class="dtou-dropdown"><button type="button" class="dropdown-link">View DToU Status</button></li>')
			.on('click', function() { console.log('view status'); openTab('/edit.html', tweetData); $('.dropdown').removeClass('open'); return true; })
			.prependTo(sel);
		$(`<li class="dtou-dropdown"><button type="button" class="dropdown-link">Create DToU Declaration</button></li>`)
			.on('click', function() { console.log('click create dtou '); openTab('/create.html', tweetData);  $('.dropdown').removeClass('open');  return true; })
			.prependTo(sel);
	},
	register = (twt) => {
		console.log('sending tweet to back to save > ', twt);
		port.postMessage({cmd:'save', data: _.extend({type:'tweet'}, twt)});
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
			text:$(tweetDOM).find('.js-tweet-text-container').text()
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
					sneakAdd(tweet, extractTweet(tweet));				
					register(extractTweet(tweet));
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
		if (msg.cmd === 'get_defs' && msg.type == 'tweet') {
			setTweetIds(msg.ids);
		} else {
			console.error("unknown message", msg);
		} 
	  	update_dom();
	});	
	$('#timeline').bind('DOMSubtreeModified', function(e) {
	  if (e.target.innerHTML.indexOf('"tweet ') >= 0) { 
	  	update_dom(); 
	  }
	//  if (e.target.innerHTML.length > 0) { update_dom(); }
	});
};

init();

