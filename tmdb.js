/*jshint node:true*/

"use strict";

var moviedb = require("moviedb");
var request = require("request");
var when = require("when");

var tmdb;
var THROTTLE_MSECS = 333;


var currentRequest = when.resolve();
function throttledRequest(method, data, callback) {
	// Ensure we got configuration first
	getConfiguration().then(function() {
		throttledNoConfigRequest(method, data, callback);
	}, function(err) {
		callback(err);
	});
}

function throttledNoConfigRequest(method, data, callback) {
	var current = currentRequest;
	var next = when.defer();
	currentRequest = next.promise;
	current.then(function doRequest() {
		tmdb[method](data, function(err, data) {
			callback(err, data);

			setTimeout(function() {
				next.resolve();
			}, THROTTLE_MSECS);
		});
	});
}

var configuration;
function getConfiguration() {
	if (configuration) {
		return when(configuration);
	} else {
		var d = when.defer();

		throttledNoConfigRequest("configuration", {}, function(e, data) {
			if (e) {
				d.reject(e);
			} else {
				configuration = data;
				d.resolve(data);
			}
		});

		return d.promise;
	}
}


module.exports = {
	setAPIKey: function(key) {
		tmdb = moviedb(key);
	},

	findShowImages: function(show, cb) {
		if (!tmdb) {
			return cb(new Error("API key for TheMovieDB was not set"));
		}

		throttledRequest("searchTV", { query: show }, function(e, data) {
			if (e) {
				cb(e);
			} else if (data.results.length === 0) {
				cb(null, {});
			} else {
				// Try to find exact show title match, or fall back to first result
				var match = data.results.filter(function(result) {
					return result.name.trim().toLowerCase() === show.trim().toLowerCase();
				})[0] || data.results[0];

				var urls = [];
				if (match.poster_path) {
					urls.push(["poster", match.poster_path]);
				}

				if (match.backdrop_path) {
					urls.push(["backdrop", match.backdrop_path]);
				}

				var buffers = {};

				when.map(urls, function(u) {
					var d = when.defer();

					request({ url: configuration.images.base_url + "original" + u[1], encoding: null }, function(err, response, data) {
						if (!err && response.statusCode === 200) {
							buffers[u[0]] = { data: data, type: response.headers["content-type"] };
						}

						d.resolve();
					});

					return d.promise;
				}).then(function() {
					cb(null, buffers);
				});
			}
		});
	}
};