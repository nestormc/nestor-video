/*jshint browser:true*/
/*global define*/
define(["ui", "resources", "ist!templates/movielist", "ist!templates/showlist"],
function(ui, resources, movielistTemplate, showlistTemplate) {
	"use strict";

	var movielist;
	var showlist;
	ui.started.add(function() {
		var movieView = ui.view("movies");

		movieView.displayed.add(function() {
			if (!movielist) {
				resources.movies.list().then(function(movies) {
					movielist = movielistTemplate.render({ movies: movies });
					movieView.appendChild(movielist);
				});
			}
		});

		var showView = ui.view("tvshows");

		showView.displayed.add(function() {
			if (!showlist) {
				resources.tvshows.list().then(function(shows) {
					showlist = showlistTemplate.render({ shows: shows });
					showView.appendChild(showlist);
				});
			}
		});
	});

	ui.stopping.add(function() {
		movielist = null;
		showlist = null;
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