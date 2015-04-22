/*global module:false*/
module.exports = function (grunt) {
	var _ = grunt.util._;
	var path = require('path');

	// Project configuration.
	grunt.initConfig({
		// Metadata.
		pkg: grunt.file.readJSON('package.json'),
		banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
			'<%= grunt.template.today("yyyy-mm-dd") %>\n' +
			'<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
			'* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
			' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n',
		// Task configuration.
		concat: {
			options: {
				banner: '<%= banner %>',
				stripBanners: true
			},
			dist: {
				src: [ '_js/lib/can.custom.js', '_js/lib/can.object.js', '_js/lib/can.fixture.js',
					   '_js/lib/grayscale.js', '_js/lib/moment.js', '_js/lib/prettify.js',
					   '_js/models/*.js', '_js/controls/*.js',
					   '_js/views.production.js', '_js/utils.js' ],
				dest: 'resources/shared.js'
			}
		},
		uglify: {
			options: {
				banner: '<%= banner %>'
			},
			dist: {
				src: '<%= concat.dist.dest %>',
				dest: 'resources/shared.min.js'
			}
		},
		less: {
			options: {
				compress: true
			},
			default: {
				files: {
					"resources/default.css": "_styles/default.less"
				}
			},
			canjs: {
				files: {
					"resources/canjs.css": "_styles/canjs.less"
				}
			}
		},
		cancompile: {
			dist: {
				src: ['_js/templates/*.mustache'],
				out: '_js/views.production.js'
			}
		}
	});

	// These plugins provide necessary tasks.
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-less');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('can-compile');

	// Default task.
	grunt.registerTask('default', [ 'cancompile', 'concat', 'uglify' ]);

};
