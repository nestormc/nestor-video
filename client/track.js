/*jshint browser:true*/
/*global define*/

define(["when", "ui", "resources", "ist!templates/trackdata"], function(when, ui, resources, tdTemplate) {
	"use strict";

	var formatPromise;
	function preferredFormat() {
		if (!formatPromise) {
			var d = when.defer();
			formatPromise = d.promise;
			resources.formats.list().then(function(formats) {
				var maybes = [];
				var probably = null;

				Object.keys(formats).forEach(function(name) {
					if (probably) {
						return;
					}

					var video = document.createElement("video");
					var format = formats[name];
					var mime = format.mimetype + "; codecs=\"" + format.codecs + "\"";

					switch (video.canPlayType(mime)) {
						case "probably":
							probably = name;
							break;

						case "maybe":
							maybes.push(name);
							break;
					}
				});

				if (probably) {
					d.resolve(probably);
				} else if (maybes.length) {
					d.resolve(maybes[0]);
				} else {
					d.reject();
				}
			});
		}

		return formatPromise;
	}


	function trackPlayable(track) {
		track.playable.dispatch();
	}


	function trackEnded(track) {
		track.ended.dispatch();
	}


	function trackLoadProgress(track) {
		var video = track.video;

		if (video.buffered.length) {
			if (Math.abs(video.buffered.end(video.buffered.length - 1) - video.duration) < 0.1) {
				track.loaded.dispatch();
			}
		}
	}


	function trackTimeUpdate(track) {
		track.timeChanged.dispatch(track.video.currentTime + (track.requestedSeek || 0));
	}


	function trackDurationChange(track) {
		if (track.video.duration !== Infinity) {
			track.lengthChanged.dispatch(track.video.duration + (track.requestedSeek || 0));
		}
	}


	function VideoTrack(dataset, id) {
		var display = document.createElement("div");
		display.className = "full-display";
		display.style.backgroundColor = "black";

		var video = document.createElement("video");
		video.style.display = "block";
		video.style.width = video.style.height = "100%";
		display.appendChild(video);

		this.video = video;

		video.controls = false;
		video.preload = "none";
		video.autoplay = false;

		this.data = null;

		var videoEvents = {
			"canplay": trackPlayable.bind(null, this),
			"ended": trackEnded.bind(null, this),
			"timeupdate": trackTimeUpdate.bind(null, this),
			"durationchange": trackDurationChange.bind(null, this),
			"progress": trackLoadProgress.bind(null, this)
		};
		this.events = videoEvents;

		Object.keys(videoEvents).forEach(function(event) {
			video.addEventListener(event, videoEvents[event]);
		});

		var metadataDeferred = when.defer();
		var datasetDeferred = when.defer();

		this.requestedLoad = false;
		this.requestedSeek = null;
		this.format = preferredFormat();
		this.playing = true;

		this.data = datasetDeferred.promise;
		this.data.then(function(d) {
			metadataDeferred.resolve({
				title: d.fulltitle,
				length: Number(d.length)
			});
		});

		if (dataset) {
			datasetDeferred.resolve(dataset);
		} else {
			var split = id.split(":");

			resources[split[0]].get(split[1]).then(function(track) {
				var element = tdTemplate.render(track).firstChild;
				datasetDeferred.resolve(element.dataset);
			});
		}

		this.playable = ui.signal();
		this.loaded = ui.signal();
		this.ended = ui.signal();
		this.timeChanged = ui.signal();
		this.lengthChanged = ui.signal();
		this.metadata = metadataDeferred.promise;
		this.display = when(display);
	}


	VideoTrack.prototype = {
		_setSource: function() {
			var track = this;

			when.all([this.data, this.format]).then(function(d) {
				var data = d[0];
				var format = d[1];

				if (track.requestedLoad) {
					track.video.src = "/rest/videostream/" + data.id + "/" + format + ":144/" + (track.requestedSeek || 0);
					track.video.preload = "auto";

					if (track.playing) {
						track.play();
					}
				}
			});
		},

		load: function() {
			this.requestedLoad = true;
			this._setSource();
		},

		stopLoading: function() {
			this.requestedLoad = false;

			this.video.src = "";
			this.video.preload = "none";
		},

		play: function() {
			this.playing = true;
			this.video.play();
		},

		pause: function() {
			this.playing = false;
			this.video.pause();
		},

		seek: function(time) {
			this.requestedSeek = time;
			this._setSource();
		},

		dispose: function() {
			var videoEvents = this.events;
			var video = this.video;

			Object.keys(videoEvents).forEach(function(event) {
				video.removeEventListener(event, videoEvents[event]);
			});

			video.pause();
			video.preload = "none";
			video.src = "";

			this.playable.dispose();
			this.loaded.dispose();
			this.ended.dispose();
			this.timeChanged.dispose();
			this.lengthChanged.dispose();
		}
	};


	return VideoTrack;
});