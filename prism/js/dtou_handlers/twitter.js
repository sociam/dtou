// - TODO pull out all dtou handling mechanisms and put them here

angular.module('dtouprism').controller('twitterdtou', function($scope) {
    console.log('>> loaded twitter dtou handler');
    var dtou_handler = (tweet, response) => {
        if (!response.data.dtou) {
            return console.log('handler got something weird', response);
        }
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
        if (response.data.pingback) {

        }
    }
});