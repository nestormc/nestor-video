/*jshint browser:true */
/*global define */

define(["when", "rest"], function(when, rest) {
	"use strict";
	
	return {
		movies: {
			list: function() {
				return rest.list("movies", { limit: 0 });
			}
		},
		tvshows: {
			list: function() {
				return rest.list("tvshows", { limit: 0 });
			}
		},
		videos: {
			get: function(id) {
				return rest.get("videos/" + id, { limit: 0 });
			}
		},
		formats: {
			list: function() {
				return rest.get("videoformats");
			}
		}
	};
});