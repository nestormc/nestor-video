/*jshint node:true*/
"use strict";

var stream = require("stream");
var when = require("when");
var tmdb = require("./tmdb");

var fetchedShows = [];

module.exports = function imageStore(nestor) {
	var logger = nestor.logger;
	var mongoose = nestor.mongoose;
	var config = nestor.config;
	var FfmpegCommand = nestor.FfmpegCommand;
	var intents = nestor.intents;
	var rest = nestor.rest;


	tmdb.setAPIKey(config.tmdbKey);



	/* Image schema */

	var ImageSchema = new mongoose.Schema({
		key: { type: String, index: true },
		data: Buffer,
		mime: String
	});

	ImageSchema.virtual("length").get(function() {
		return this.data.length;
	});

	var Image = mongoose.model("video-image", ImageSchema);

	rest.mongoose("video-images", Image)
		.set("key", "key")
		.set("toObject", {
			virtuals: true,

			transform: function(doc, ret, options) {
				delete ret.__v;
				delete ret.id;
				delete ret.data;
			}
		})
		.sub(":imageKey")
			.get(function(req, cb) {
				var image = req.mongoose.doc;
				cb(null, image.data, image.mime);
			});


	/* Processor registration */

	intents.on("nestor:startup", function() {
		intents.emit("nestor:scheduler:register", "video:ffmpeg-thumb", function(data) {
			var d = when.defer();
			var passthrough = new stream.PassThrough();

			var buffers = [];
			var length = 0;

			passthrough.on("data", function(data) {
				buffers.push(data);
				length += data.length;
			});

			passthrough.on("end", function() {
				d.resolve();
				data.callback(Buffer.concat(buffers, length), "image/jpeg");
			});

			(new FfmpegCommand({ source: data.path }))
				.setStartTime(Math.floor(data.seek))
				.withNoAudio()
				.toFormat("image2")
				.withVideoCodec("mjpeg")
				.takeFrames(1)
				.on("error", function(err) {
					d.resolve();
					logger.warn("Error while fetching thumbnail from %s: %s", data.path, err);
				})
				.writeToStream(passthrough);

			return d.promise;
		});
	});



	/* External interface */

	return {
		fetchShowImages: function(show) {
			if (fetchedShows.indexOf(show) !== -1) {
				return;
			}

			fetchedShows.push(show);
			Image.find(
				{ key: { $in: ["tvshow:poster:" + show, "tvshow:backdrop:" + show] } },
				function(err, images) {
					if (err) {
						logger.warn("Error searching %s images: %s", show, err.message);
						return;
					}

					if (!images || images.length === 0) {
						tmdb.findShowImages(show, function(err, buffers) {
							if (err) {
								logger.warn("TMDB error for show %s: %s", show, err.message);
								return;
							}

							Object.keys(buffers).forEach(function(type) {
								var image = new Image({
									key: "tvshow:" + type + ":" + show,
									data: buffers[type].data,
									mime: buffers[type].mime
								});

								image.save();
							});
						});
					}
				}
			);
		},

		extractThumbs: function(path, id, duration) {
			[1, 2, 3].forEach(function(mult) {
				var seek = mult * duration / 4;
				var thumbKey = "thumb:" + id + ":" + mult;

				Image.findOne({ key: thumbKey }, function(err, image) {
					if (err) {
						logger.warn("Error searching thumbs #%s for %s", mult, id);
						return;
					}

					if (!image) {
						intents.emit("nestor:scheduler:enqueue", "video:ffmpeg-thumb", {
							path: path,
							seek: seek,
							callback: function(buffer, mimetype) {
								(new Image({
									key: thumbKey,
									data: buffer,
									mime: mimetype
								})).save();
							}
						});
					}
				});
			});
		}
	};
};


