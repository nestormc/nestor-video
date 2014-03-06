/*jshint node:true */

"use strict";

var ffmpeg = require("fluent-ffmpeg");


var presets = {
	"webm": {
		mimetype: "video/webm",
		codecs: "vp8.0, vorbis",

		acodec: "libvorbis",
		abitrates: {
			"480": "160k"
		},
		
		vcodec: "libvpx",
		voptions: {
			"*": ["-crf 15", "-preset ultrafast"]
		}
	},

	"mp4": {
		mimetype: "video/mp4",
		codecs: "h264, aac",

		acodec: "libvo_aacenc",
		abitrates: {
			"480": "128k"
		},
		
		vcodec: "libx264",
		voptions: {
			"*": ["-crf 30", "-preset ultrafast"]
		}
	},

	"ogg": {
		mimetype: "video/ogg",
		codecs: "theora, vorbis",

		acodec: "libvorbis",
		abitrates: {
			"480": "160k"
		},
		
		vcodec: "libtheora",
		vbitrates: {
			"480": "1000k"
		}
	}
};


function applyPreset(ff, name) {
	var parts = name.split(":");
	var format = parts[0];
	var q = parts[1];

	var preset = presets[format];

	ff.withAudioCodec(preset.acodec).withAudioChannels(2);

	var abitrate = preset.abitrates ? preset.abitrates[q] : null;
	if (abitrate) {
		ff.withAudioBitrate(abitrate);
	}

	ff.withVideoCodec(preset.vcodec).withSize("?x" + q);

	var vbitrate = preset.vbitrates ? preset.vbitrates[q] : null;
	if (vbitrate) {
		ff.withVideoBitrate(vbitrate);
	}

	if (preset.voptions) {
		var voptions = (preset.voptions["*"] || []).concat(preset.voptions[q] || []);
		if (voptions.length) {
			ff.addOptions(voptions);
		}
	}

	return ff.toFormat(format);
}


module.exports = function streamVideo(video, preset, startTime, response) {
	response.setHeader("X-Content-Duration", video.length);
	response.type(presets[preset.split(":")[0]].mimetype);

	applyPreset(ffmpeg({ source: video.path, timeout: 0 }), preset)
		.setStartTime(startTime)
		.on("error", function(e) {
			// Just catch error events to prevent nestor from stopping
		})
		.writeToStream(response);
};

module.exports.formats = presets;