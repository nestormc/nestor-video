/*jshint node:true */
"use strict";

var util = require("util");
var streamVideo = require("./stream");



function videoPlugin(nestor) {
	var intents = nestor.intents;
	var mongoose = nestor.mongoose;
	var rest = nestor.rest;
	var logger = nestor.logger;
	var misc = nestor.misc;


	function getVideoData(meta) {
		var title;

		if (meta.metadata.title && meta.metadata.title.length > meta.filename.length) {
			title = meta.metadata.title;
		} else {
			title = meta.filename;
		}

		var data = {
			year: meta.metadata.year || -1,
			length: meta.format.duration,
			tags: []
		};

		// Clean up title
		data.title = misc.titleCase(title
			.replace(/\.(avi|divx|mpg|mpeg|mkv)$/i, "")
			.replace(/\b(dvdrip|xvid|divx|hdtv|bdrip|fastsub|vostfr|notv|fqm|dsr)\b/ig, "")
			.replace(/[_.]/g, " "));

		// Find show title, season and episode
		var m = data.title.match(/^(.*)s(\d+)e(\d+)(.*)$/i);
		if (m) {
			data.show = m[1].trim();
			data.season = parseInt(m[2], 10);
			data.episode = parseInt(m[3], 10);
			data.title = m[4].trim();
		}

		return data;
	}



	/* Base schema for all video models */

	function BaseSchema() {
		mongoose.Schema.apply(this, arguments);

		this.add({
			path: String,
			mime: String
		});
	}
	util.inherits(BaseSchema, mongoose.Schema);

	var VideoSchema = new BaseSchema();
	var Video = mongoose.model("video", VideoSchema);



	/* Subtitle schema */
	var SubtitleSchema = new BaseSchema();
	var Subtitle = Video.discriminator("subtitle", SubtitleSchema);



	/* Movie schema */

	var MovieSchema = new BaseSchema({
			title: String,
			year: Number,
			length: Number,
			tags: [String]
	});

	MovieSchema.virtual("fullTitle").get(function() {
		return this.title;
	});

	var Movie = Video.discriminator("movie", MovieSchema);
	var movieSort = { title: 1 };
	var movieToObject = {
		virtuals: true,

		transform: function(doc, ret, options) {
			delete ret.__v;
			delete ret.id;
		}
	};

	rest.mongoose("movies", Movie)
		.set("sort", movieSort)
		.set("toObject", movieToObject);



	/* Episode schema */

	var EpisodeSchema = new BaseSchema({
			title: String,
			year: Number,
			length: Number,
			tags: [String],
			show: String,
			season: Number,
			episode: Number
		});

	EpisodeSchema.virtual("fullTitle").get(function() {
		return this.show + " S" + this.season + "E" + this.episode + " " + this.title;
	});

	var Episode = Video.discriminator("episode", EpisodeSchema);
	var episodeSort = { show: 1, season: 1, episode: 1 };

	rest.mongoose("episodes", Episode)
		.set("sort", episodeSort)
		.set("toObject", movieToObject);



	/* Streaming endpoints */

	rest.resource("videostream/:id/:format/:start")
		.get(function(req, cb) {
			var format = req.params.format;
			var start = req.params.start;

			Video.findById(req.params.id, function(err, v) {
				if (err) {
					cb(err);
				} else if (!v) {
					cb.notFound();
				} else {
					cb.custom(function(req, res, next) {
						try {
							streamVideo(v, format, parseFloat(start), res);
						} catch(e) {
							res.send(404);
						}
					});
				}
			});
		});

	rest.resource("videostream/formats")
		.get(function(req, cb) {
			cb(null, streamVideo.formats);
		});



	/* Intent handlers */

	function fetchThumbs(filepath, id, duration) {
		[1, 2, 3].forEach(function(mult) {
			nestor.intents.emit(
				"cover:video-thumb",
				filepath,
				mult,
				id,
				mult * duration / 4
			);
		});
	}


	intents.on("nestor:startup", function() {
		intents.emit("nestor:watchable", "movies", Movie, {
			sort: movieSort,
			toObject: movieToObject
		});

		intents.emit("nestor:watchable", "episodes", Episode, {
			sort: episodeSort,
			toObject: movieToObject
		});
	});


	function saveVideo(filepath, mimetype, metadata) {
		function error(action, err) {
			logger.error("Could not %s: %s", action, err.message || err);
		}

		var videodata = getVideoData(metadata);

		videodata.path = filepath;
		videodata.mime = mimetype;

		var Model = videodata.show ? Episode : Movie;

		Model.findOne({ path: filepath }, function(err, video) {
			if (err) {
				return error("search video", err);
			}

			if (video) {
				video.update(videodata, function(err) {
					if (err) {
						return error("update video", err);
					}

					fetchThumbs(filepath, video._id, metadata.format.duration);

					if (videodata.show) {
						nestor.intents.emit("cover:tvshow", videodata.show);
					}
				});
			} else {
				video = new Model(videodata);
				video.save(function(err, savedvideo) {
					if (err) {
						return error("save video", err);
					}

					fetchThumbs(filepath, savedvideo._id, metadata.format.duration);

					if (videodata.show) {
						nestor.intents.emit("cover:tvshow", videodata.show);
					}
				});
			}
		});
	}

	function saveSubtitle(filepath, mimetype) {
		function error(action, err) {
			logger.error("Could not %s: %s", action, err.message || err);
		}

		var subtitledata = {
			path: filepath,
			mime: mimetype
		};

		Subtitle.findOne({ path: filepath }, function(err, subtitle) {
			if (err) {
				return error("search subtitle", err);
			}

			if (subtitle) {
				subtitle.update(subtitledata, function(err) {
					if (err) {
						return error("update subtitle", err);
					}
				});
			} else {
				subtitle = new Subtitle(subtitledata);
				subtitle.save(function(err) {
					if (err) {
						return error("save video", err);
					}
				});
			}
		});
	}


	intents.on("media:file", function analyzeFile(filepath, mimetype, metadata) {
		if (mimetype.split("/")[0] !== "video") {
			return;
		}

		var hasVideoStreams = metadata.streams.some(function(stream) {
			return stream.codec_type === "video";
		});

		var hasSubtitleStreams = metadata.streams.some(function(stream) {
			return stream.codec_type === "subtitle";
		});

		if (hasVideoStreams) {
			saveVideo(filepath, mimetype, metadata);
		} else if (hasSubtitleStreams) {
			saveSubtitle(filepath, mimetype);
		}
	});
}


videoPlugin.manifest = {
	name: "video",
	description: "Video library",
	dependencies: ["nestor-media"],
	recommends: ["nestor-coverart"],
	client: {
		public: __dirname + "/client/public",
		build: {
			base: __dirname + "/client"
		}
	}
};


module.exports = videoPlugin;
