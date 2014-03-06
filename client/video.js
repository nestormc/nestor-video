/*jshint browser:true*/
/*global define*/
define(["ui", "router", "resources", "track", "movielist", "showlist"],
function(ui, router, resources, VideoTrack) {
	"use strict";

	ui.started.add(function() {
		ui.player.register("video", function(id) {
			return new VideoTrack(null, id);
		});
	});

	return {
		title: "video",
		css: "videos",
		views: {
			movies: {
				type: "main",
				link: "movies"
			},

			tvshows: {
				type: "main",
				link: "tv shows"
			}
		}
	};
});