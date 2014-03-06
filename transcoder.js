/*jshint node:true */

"use strict";

var ffmpeg = require("fluent-ffmpeg");
var path = require("path");
var fs = require("fs");


var presets = {
	"webm": {
		acodec: "libvorbis",
		abitrates: {
			"480": "160k"
		},
		
		vcodec: "libvpx",
		vbitrates: {
			"480": "1000k"
		}
	},

	"ogg": {
		acodec: "libvorbis",
		abitrates: {
			"480": "160k"
		},
		
		vcodec: "libtheora",
		vbitrates: {
			"480": "1000k"
		}
	},

	"mp4": {
		acodec: "libvo_aacenc",
		abitrates: {
			"480": "128k"
		},
		
		vcodec: "libx264",
		voptions: {
			"*": ["-crf 23", "-preset ultrafast"]
		}
	}
};



function TranscodeJob(logger, id, source, duration, preset, outfile) {
	var ff = ffmpeg({ source: source, timeout: 0 });

	this.logger = logger;
	this.id = id;
	this.outfile = outfile;
	this.outsize = 0;
	this.ff = ff;
	this.duration = duration;
	this.rearm();

	var targetPrecision = 0.1;
	var precisionSampleCount = 10;
	var predictedSizes = [];
	var predictedSize = null;
	var prevTargetSize;
	var predictionDeferred = when.defer();

	this.sizePrediction = predictionDeferred.promise;

	this.applyPreset(preset)
		.onProgress(function(data) {
			if (data.percent > 0 && data.targetSize !== prevTargetSize) {
				var newPredictedSize = Math.ceil(1024 * 100 * data.targetSize / data.percent);

				logger.debug("job %s progress %s%%", id, Math.floor(data.percent * 10) / 10);

				predictedSizes.push(newPredictedSize);
				if (predictedSizes.length > precisionSampleCount) {
					predictedSizes.shift();

					var maxPredictedSize = Math.max.apply(Math, predictedSizes);
					var minPredictedSize = Math.min.apply(Math, predictedSizes);
					var currentPrecision = (maxPredictedSize - minPredictedSize) / maxPredictedSize;


					if (currentPrecision < targetPrecision && predictedSize === null) {
						predictedSize = maxPredictedSize * (1 + targetPrecision);
						logger.info("Predicted size: %s bytes", predictedSize);

						predictionDeferred.resolve(predictedSize);
					}

					if (predictedSize !== null && maxPredictedSize > predictedSize) {
						logger.warn("Incorrect prediction, new max predicted size: %s bytes", maxPredictedSize);
						predictedSize = maxPredictedSize * (1 + targetPrecision);
					}
				}
			}

			prevTargetSize = data.targetSize;
		});

	fs.unlink(outfile, function() {
		ff.saveToFile(outfile, function(stdout, stderr, err) {
			if (stdout == ffmpeg.E_PROCESSTIMEOUT) {
				logger.error("job %s got timeout", id);
				return;
			}

			if (err) {
				logger.error("job %s got error %s\n%s", id, err.message, stderr);
				return;
			}

			logger.debug("job %s in save callback\n%s\n----\n%s", id, stdout, stderr);
		});
	});
}


function getBitrate(bitrateString) {
	if (bitrateString.indexOf("k") !== -1) {
		return 1024 * parseInt(bitrateString.replace("k", ""), 10);
	} else if (bitrateString.indexOf("M") !== -1) {
		return 1024 * 1024 * parseInt(bitrateString.replace("M", ""), 10);
	} else {
		return parseInt(bitrateString, 10);
	}
}


TranscodeJob.prototype.applyPreset = function(name) {
	var ff = this.ff;

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
			this.ff.addOptions(voptions);
		}
	}

	return this.ff.toFormat(format);
};


var TRANSCODED_LIFETIME = 60000;
TranscodeJob.prototype.rearm = function() {
	if (this.purgeTimeout) {
		clearTimeout(this.purgeTimeout);
	}

	//this.purgeTimeout = setTimeout(this.purge.bind(this), TRANSCODED_LIFETIME);
};


TranscodeJob.prototype.purge = function() {
	this.logger.debug("Purging output file for job %s", this.id);

	this.ff.kill();
	fs.unlink(this.outfile, function() {});
};


TranscodeJob.prototype.getTotalSize = function(callback) {
	this.rearm();

	this.sizePrediction.then(function(size) {
		callback(null, size);
	});
};


TranscodeJob.prototype.getChunk = function(offset, length, callback) {
	this.rearm();

	callback(new Error("Not implemented"));
};


var jobs = {};
module.exports = function getTranscodeJob(logger, tmpdir, video, preset) {
	var jobid = video._id + ":" + preset;

	if (!(jobid in jobs)) {
		logger.debug("Creating transcode job " + jobid + " to file " + path.join(tmpdir, jobid));
		jobs[jobid] = new TranscodeJob(logger, jobid, video.path, video.length, preset, path.join(tmpdir, jobid));
	}

	var job = jobs[jobid];
	job.rearm();

	return job;
};
