/*jshint node:true */
"use strict";

var util = require("util");
var path = require("path");


function mapStream(stream) {
	return {
		index: Number(stream.index),
		type: stream.codec_type,
		codec: stream.codec_name,
		profile: stream.profile,
		level: stream.level
	};
}


function videoPlugin(nestor) {
	var intents = nestor.intents;
	var mongoose = nestor.mongoose;
	var rest = nestor.rest;
	var logger = nestor.logger;
	var misc = nestor.misc;
	var config = nestor.config;


	function getVideoData(filename, meta) {
		var data = {
			year: meta.tags.year || -1,
			length: meta.format.duration,
			tags: [],
			title: filename,
			format: meta.format.format_name
		};

		data.streams = meta.streams.map(mapStream);

		var vstream = meta.streams.filter(function(s) { return s.codec_type === "video"; })[0];
		data.width = vstream.width;
		data.height = vstream.height;

		// Try to find year in title
		var ymatch = data.title.match(/[(\[](\d{4})[)\]]/);
		if (ymatch) {
			data.year = Number(ymatch[1]);
			data.title = data.title.replace(ymatch[1], "");
		}

		// Clean up title
		data.title = data.title
			.replace(/\.(avi|divx|mpg|mpeg|mkv|mp4|mov|ogg|ogv)$/i, "")
			.replace(/\b(dvdrip|xvid|divx|hdtv|bdrip|fastsub|vostfr|notv|dsr|vtv)\b/ig, "")
			.replace(/\b(aXXo|LOL|FQM|fqm)\b/g, "")
			.replace(/[_.]/g, " ")
			.replace(/(--|\[\]|\(\)|^\W+|\W+$)/g, "");

		// Find show title, season and episode
		var m = data.title.match(/^(.*)s?(\d+)e(\d+)(.*)$/i);
		if (m) {
			data.show = m[1].trim();
			data.season = parseInt(m[2], 10);
			data.episode = parseInt(m[3], 10);
			data.title = m[4].trim();
		}

		return data;
	}



	/* Base schema for all video models */

	var StreamSchema = new mongoose.Schema({
		index: Number,
		type: { type: String },
		codec: String,
		profile: String,
		level: Number
	}, { _id: false });

	function BaseSchema() {
		mongoose.Schema.apply(this, arguments);

		this.add({
			path: String,
			mime: String,
			format: String,
			streams: [StreamSchema],
			width: Number,
			height: Number
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

		/* Watchable collections */

		intents.emit("nestor:watchable", "movies", Movie, {
			sort: movieSort,
			toObject: movieToObject
		});

		intents.emit("nestor:watchable", "episodes", Episode, {
			sort: episodeSort,
			toObject: movieToObject
		});


		/* Streaming provider */

		intents.emit("nestor:streaming", "video", function(id, callback) {
			Video.findById(id, function(err, v) {
				if (err || !v) {
					return callback(err);
				}

				var data = {
					source: v.path,
					type: "video",
					length: v.length,
					title: v.fullTitle,

					format: v.format,
					streams: v.streams,

					width: v.width,
					height: v.height
				};

				if (config.burnSubtitles) {
					Subtitle.findOne(
						{ path: {$regex: new RegExp("^" + misc.regexpEscape(v.path.replace(/\.[^.]*$/, ""))) } },
						function(err, subtitle) {
							if (err) {
								return callback(err);
							}

							if (subtitle) {
								data.filters = ["subtitles=" + subtitle.path.replace(/([\[\],;'])/g, "\\$1")];
							}

							callback(null, data);
						}
					);
				} else {
					callback(null, data);
				}
			});
		});

	});


	function saveVideo(filepath, mimetype, metadata) {
		function error(action, err) {
			logger.error("Could not %s: %s", action, err.message || err);
		}

		var videodata = getVideoData(path.basename(filepath), metadata);

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

	function saveSubtitle(filepath, mimetype, metadata) {
		function error(action, err) {
			logger.error("Could not %s: %s", action, err.message || err);
		}

		var subtitledata = {
			path: filepath,
			mime: mimetype,
			format: metadata.format.format_name,
			streams: metadata.streams.map(mapStream)
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
		if (!metadata) {
			return;
		}

		var hasVideoStreams = metadata.streams.some(function(stream) {
			return stream.codec_type === "video" && ["bmp", "ansi", "jpeg2000", "mjpeg", "png"].indexOf(stream.codec_name) === -1;
		});

		var hasSubtitleStreams = metadata.streams.some(function(stream) {
			return stream.codec_type === "subtitle";
		});

		if (hasVideoStreams) {
			saveVideo(filepath, mimetype, metadata);
		} else if (hasSubtitleStreams) {
			saveSubtitle(filepath, mimetype, metadata);
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
