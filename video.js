/*jshint node:true */
"use strict";


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
	data.title = title
		.replace(/\.(avi|divx|mpg|mpeg|mkv)$/i, "")
		.replace(/(dvdrip|xvid|divx|hdtv|bdrip|fastsub)/ig, "")
		.replace(/[_.]/g, " ");

	// Find show title, season and episode
	var m = data.title.match(/^(.*)s(\d+)e(\d+)(.*)$/i);
	if (m) {
		data.tags.push("show:" + m[1].trim());
		data.tags.push("season:" + parseInt(m[2], 10));
		data.tags.push("episode:" + parseInt(m[3], 10));
		data.title = m[4].trim();
	}

	return data;
}


function videoPlugin(nestor) {
	var intents = nestor.intents;
	var mongoose = nestor.mongoose;
	var rest = nestor.rest;
	var logger = nestor.logger;


	var VideoSchema = new mongoose.Schema({
		path: String,
		mime: String,

		title: String,
		year: Number,

		tags: [String]
	});

	VideoSchema.methods.getTagValues = function(name) {
		return this.tags.reduce(function(values, tag) {
			if (tag.indexOf(name + ":") === 0) {
				values.push(tag.substr(name.length + 1));
			}

			return values;
		}, []);
	};

	VideoSchema.virtual("show").get(function() {
		var values = this.getTagValues("show");
		return values.length ? values[0] : null;
	});

	VideoSchema.virtual("season").get(function() {
		var values = this.getTagValues("season");
		return values.length ? parseInt(values[0], 10) : null;
	});

	VideoSchema.virtual("episode").get(function() {
		var values = this.getTagValues("episode");
		return values.length ? parseInt(values[0], 10) : null;
	});


	var Video = mongoose.model("video", VideoSchema);


	intents.on("media:file", function analyzeFile(filepath, mimetype, metadata) {
		if (mimetype.split("/")[0] !== "video") {
			return;
		}

		var hasVideoStreams = metadata.streams.some(function(stream) {
			return stream.codec_type === "video";
		});

		if (!hasVideoStreams) {
			return;
		}

		function error(action, err) {
			logger.error("Could not %s: %s", action, err.message || err);
		}

		var videodata = getVideoData(metadata);

		videodata.path = filepath;
		videodata.mime = mimetype;

		Video.findOne({ path: filepath }, function(err, video) {
			if (err) {
				return error("search video", err);
			}

			if (video) {
				video.update(videodata, function(err) {
					if (err) {
						return error("update video", err);
					}
				});
			} else {
				video = new Video(videodata);
				video.save(function(err, savedvideo) {
					if (err) {
						return error("save video", err);
					}

					[1, 2, 3].forEach(function(mult) {
						nestor.intents.emit(
							"cover:video-thumb",
							filepath,
							mult,
							savedvideo._id,
							mult * metadata.format.duration / 4
						);
					});
				});
			}
		});
	});

	rest.mongoose("videos", Video)
		.set("sort", { title: 1 })
		.set("toObject", {
			virtuals: true,

			transform: function(doc, ret, options) {
				delete ret.__v;
				delete ret.id;
			}
		});

	/*rest.aggregate("shows", Video, [
		{ $project: {
			show: "$tags",
			season: "$tags",
			episode: "$tags",
			tags: "$tags",
			path: 1
		} },
		{ $unwind: "$show" },
		{ $match: { show: { $regex: /show:/ } } },
		{ $unwind: "$season" },
		{ $match: { season: { $regex: /season:/ } } },
		{ $unwind: "$episode" },
		{ $match: { episode: { $regex: /episode:/ } } },
		{ $project: {
			path: 1,
			show: { $substr: [ "$show", 5, -1 ] },
			season: { $substr: [ "$season", 7, -1 ] },
			episode: { $substr: [ "$episode", 8, -1 ] }
		} },
		{ $sort: {
			show: 1,
			season: 1,
			episode: 1
		} },
		{ $group: {
			_id: {
				show: "$show",
				season: "$season"
			},
			episodes: { $addToSet: {
				_id: "$_id",
				path: "$path"
			} }
		} },
		{ $group: {
			_id: "$_id.show",
			seasons: { $addToSet: {
				_id: "$_id.season",
				episodes: "$episodes"
			} }
		} }
	]);*/
}


videoPlugin.manifest = {
	name: "video",
	description: "Video library",
	dependencies: ["nestor-media"],
	recommends: ["nestor-coverart"]
};


module.exports = videoPlugin;
