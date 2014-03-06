/*jshint browser:true*/
/*global define*/
define(["dom", "ui", "router", "resources", "track", "ist!templates/showlist"],
function(dom, ui, router, resources, VideoTrack, showlistTemplate) {
	"use strict";

	var showlist;
	ui.started.add(function startShowlist() {
		var showView = ui.view("tvshows");
		var behaviour = ui.helpers.listSelectionBehaviour(
				showView,
				"li.episode",
				".tvshow",
				function onEpisodeDblclick(episodes, index) {
					ui.player.clear();
					ui.player.enqueue(episodes.map(function(episode) {
						return {
							provider: "video",
							id: episode.dataset.id,
							track: new VideoTrack(episode.dataset)
						};
					}));

					ui.player.play(index);
				}
			);

		showView.displayed.add(function() {
			if (!showlist) {
				resources.tvshows.list().then(function(shows) {
					showlist = showlistTemplate.render({ shows: shows });
					showView.appendChild(showlist);
					showView.behave(behaviour);
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

		router.on("!enqueue/episode/:id", function(err, req, next) {
			var episode = showView.$(".episode[data-id='" + req.match.id + "']");
			enqueue(episode.dataset, true);
			next();
		});

		router.on("!add/episode/:id", function(err, req, next) {
			var episode = showView.$(".episode[data-id='" + req.match.id + "']");
			enqueue(episode.dataset);
			next();
		});
	});

	ui.stopping.add(function() {
		showlist = null;
	});
});