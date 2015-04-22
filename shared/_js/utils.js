(function() {
	Bitovi.OSS.initTwitterWidgets = function() {
		if($('.twitter-follow-button').length) {
			// replace the "Follow @canjs!" link with a little wiget with follower count.
			$('#twitter-wjs').remove();
			!function (d, s, id) {
				var js, fjs = d.getElementsByTagName(s)[0];
				if (!d.getElementById(id)) {
					js = d.createElement(s);
					js.id = id;
					js.src = "//platform.twitter.com/widgets.js";
					fjs.parentNode.insertBefore(js, fjs);
				}
			}(document, "script", "twitter-wjs");
		}
	};

	Bitovi.OSS.redrawFont = function() {
		var style = $('<style>:before,:after{content:none !important}</style>');
		$('head').append(style);

		window.setTimeout(function() {
			style.remove();
		}, 0);
	};
})();
