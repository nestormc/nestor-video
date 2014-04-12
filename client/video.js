/*jshint browser:true*/
/*global define*/
define(["ui", "router", "resources", "movielist", "showlist"],
function(ui, router, resources) {
	"use strict";


	return {
		title: "video",
		css: "videos",
		views: {
			movies: {
				type: "main",
				link: "movies",
				icon: "video:movie"
			},

			tvshows: {
				type: "main",
				link: "tv shows",
				icon: "video:tv"
			}
		}
	};
});