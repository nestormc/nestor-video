/*jshint browser:true*/
/*global define*/
define(["ist", "ui", "router", "resources", "ist!templates/movielist"],
function(ist, ui, router, resources, movielistTemplate) {
	"use strict";

	function enqueue(dataset, next) {
		ui.player.enqueue({
			track: new ui.player.Track("video", dataset.id)
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
			},

			"!play/movie/:id": function(view, err, req, next) {
				var movie = view.$(".movie[data-id='" + req.match.id + "']");
				ui.player.clear();
				enqueue(movie.dataset);
				ui.player.play(0);
				next();
			}
		},

		listSelection: {
			itemSelector: ".movie",
			listSelector: ".movie",
			onItemDblClick: function(movies, index) {
				ui.player.clear();
				ui.player.enqueue(movies.map(function(movie) {
					return {
						track: new ui.player.Track("video", movie.dataset.id)
					};
				}));

				ui.player.play(index);
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