/*jshint browser:true*/
/*global define*/
define(["ui", "router", "resources", "track", "ist!templates/movielist"],
function(ui, router, resources, VideoTrack, movielistTemplate) {
	"use strict";

	var movielist;
	ui.started.add(function startMovielist() {
		var movieView = ui.view("movies");

		movieView.displayed.add(function() {
			if (!movielist) {
				resources.movies.list().then(function(movies) {
					movielist = movielistTemplate.render({ movies: movies });
					movieView.appendChild(movielist);
				});
			}
		});
		
		function enqueue(dataset, next) {
			ui.player.enqueue({
				provider: "video",
				id: dataset.id,
				track: new VideoTrack(dataset)
			}, next);
		}

		router.on("!enqueue/movie/:id", function(err, req, next) {
			var movie = movieView.$(".movie[data-id='" + req.match.id + "']");
			enqueue(movie.dataset, true);
			next();
		});

		router.on("!add/movie/:id", function(err, req, next) {
			var movie = movieView.$(".movie[data-id='" + req.match.id + "']");
			enqueue(movie.dataset);
			next();
		});
	});

	ui.stopping.add(function() {
		movielist = null;
	});
});