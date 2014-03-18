/*jshint browser:true */
/*global define */

define(["rest", "io"], function(rest, io) {
	"use strict";
	
	return {
		movies: {
			get: function(id) {
				return rest.get("movies/%s", id);
			},

			watch: function() {
				return io.watch("movies");
			}
		},

		episodes: {
			get: function(id) {
				return rest.get("episodes/%s", id);
			},

			watch: function() {
				return io.watch("episodes");
			}
		},
		
		formats: {
			list: function() {
				return rest.get("videostream/formats");
			}
		}
	};
});