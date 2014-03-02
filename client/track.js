/*jshint browser:true*/
/*global define*/

define(["when", "ui", "resources", "ist!templates/trackdata"], function(when, ui, resources, tdTemplate) {
	"use strict";


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
		track.timeChanged.dispatch(track.video.currentTime);
	}


	function trackDurationChange(track) {
		track.lengthChanged.dispatch(track.video.duration);
	}


	function MusicTrack(dataset, id) {
		var video = document.createElement("video");
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

		this.data = datasetDeferred.promise;
		this.data.then(function(d) {
			metadataDeferred.resolve({
				title: d.title,
				length: d.length
			});
		});

		if (dataset) {
			datasetDeferred.resolve(dataset);
		} else {
			resources.videos.get(id).then(function(track) {
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
		this.display = when(video);
	}


	MusicTrack.prototype = {
		load: function() {
			var track = this;

			this.requestedLoad = true;
			this.data.then(function(d) {
				if (track.requestedLoad) {
					if (track.audio.src === "") {
						track.audio.src = d.file;
					}

					track.audio.preload = "auto";
				}
			});
		},

		stopLoading: function() {
			this.requestedLoad = false;

			this.audio.src = "";
			this.audio.preload = "none";
		},

		play: function() {
			if (this.requestedSeek !== null) {
				this.audio.currentTime = this.requestedSeek;
				this.requestedSeek = null;
			}

			this.audio.play();
		},

		pause: function() {
			this.audio.pause();
		},

		seek: function(time) {
			try {
				this.audio.currentTime = time;
			} catch(e) {
				this.requestedSeek = time;
			}
		},

		dispose: function() {
			var audioEvents = this.events;
			var audio = this.audio;

			Object.keys(audioEvents).forEach(function(event) {
				audio.removeEventListener(event, audioEvents[event]);
			});

			audio.pause();
			audio.preload = "none";
			audio.src = "";

			this.playable.dispose();
			this.loaded.dispose();
			this.ended.dispose();
			this.timeChanged.dispose();
			this.lengthChanged.dispose();
		}
	};


	return MusicTrack;
});