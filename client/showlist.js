/*jshint browser:true*/
/*global define*/
define(["dom", "ui", "router", "resources", "ist", "ist!templates/showlist"],
function(dom, ui, router, resources, ist, showlistTemplate) {
	"use strict";

	function episodeMapper(episodes) {
		return { tvshows: episodes.reduce(function(shows, episode) {
			var show = shows.filter(function(show) {
				return show.name === episode.show;
			})[0];

			if (!show) {
				show = { name: episode.show, seasons: [] };
				shows.push(show);
			}

			var season = show.seasons.filter(function(season) {
				return season.number === episode.season;
			})[0];

			if (!season) {
				season = { number: episode.season, episodes: [] };
				show.seasons.push(season);
			}

			season.episodes.push(episode);

			return shows;
		}, []) };
	}


	function enqueue(dataset, next) {
		ui.player.enqueue({
			track: new ui.player.Track("video", dataset.id)
		}, next);
	}


	var contentListConfig = {
		resource: resources.episodes,
		dataMapper: episodeMapper,

		routes: {
			"!enqueue/episode/:id": function(view, err, req, next) {
				var episode = view.$(".episode[data-id='" + req.match.id + "']");
				enqueue(episode.dataset, true);
				next();
			},

			"!add/episode/:id": function(view, err, req, next) {
				var episode = view.$(".episode[data-id='" + req.match.id + "']");
				enqueue(episode.dataset);
				next();
			}
		},

		listSelection: {
			itemSelector: "li.episode",
			listSelector: ".tvshow",
			onItemDblClick: function(episodes, index) {
				ui.player.clear();
				ui.player.enqueue(episodes.map(function(episode) {
					return {
						track: new ui.player.Track("video", episode.dataset.id)
					};
				}));

				ui.player.play(index);
			}
		},

		root: {
			template: showlistTemplate,
			selector: ".showlist",
			childrenArray: "tvshows",
			childrenConfig: "tvshow",
			childSelector: ".tvshow"
		},

		tvshow: {
			template: ist("@use 'video-tvshow'"),
			key: "name",
			selector: ".tvshow[data-name='%s']",
			childrenArray: "seasons",
			childrenConfig: "season",
			childSelector: ".season"
		},

		season: {
			template: ist("@use 'video-tvshow-season'"),
			key: "number",
			selector: ".season[data-number='%s']",
			childrenArray: "episodes",
			childrenConfig: "episode",
			childSelector: ".episode"
		},

		episode: {
			template: ist("@use 'video-tvshow-episode'"),
			key: "_id",
			selector: ".episode[data-id='%s']",
		}
	};

	ui.started.add(function() {
		var showView = ui.view("tvshows");
		ui.helpers.setupContentList(showView, contentListConfig);
	});
});