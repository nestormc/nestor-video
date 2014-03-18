/*jshint browser:true*/
/*global define*/
define(["ist", "ui", "router", "resources", "track", "ist!templates/movielist"],
function(ist, ui, router, resources, VideoTrack, movielistTemplate) {
	"use strict";
	
	function enqueue(dataset, next) {
		ui.player.enqueue({
			provider: "video",
			id: "movie:" + dataset.id,
			track: new VideoTrack(dataset)
		}, next);
	}

	var contentListConfig = {
		resource: resources.movies,
		dataMapper: function(movies) { return { movies: movies }; },

		routes: {
			"!enqueue/movie/:id": function(view, err, req, next) {
				var movie = view.$(".movie[data-id='" + req.match.id + "']");
				enqueue(movie.dataset, true);
				next();
			},

			"!add/movie/:id": function(view, err, req, next) {
				var movie = view.$(".movie[data-id='" + req.match.id + "']");
				enqueue(movie.dataset);
				next();
			}
		},

		root: {
			template: movielistTemplate,

			selector: ".movielist",
			childrenArray: "movies",
			childrenConfig: "movie",
			childSelector: ".movie"
		},

		movie: {
			template: ist("@use 'video-movie'"),
			key: "_id",
			selector: ".movie[data-id='%s']"
		}
	};


	ui.started.add(function startMovielist() {
		var movieView = ui.view("movies");
		ui.helpers.setupContentList(movieView, contentListConfig);
	});
});