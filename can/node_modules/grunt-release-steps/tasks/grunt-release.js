/*
 * grunt-release
 * https://github.com/geddski/grunt-release
 *
 * Copyright (c) 2013 Dave Geddes
 * Licensed under the MIT license.
 */

var shell = require('shelljs');
var semver = require('semver');

module.exports = function(grunt){

    'use strict';

    grunt.registerTask('release', 'bump version, git tag, git push, npm publish', function() {
      var actions = {
         bump: bump,
         add: add,
         commit: commit,
         tag: tag,
         push: push,
         pushTags: pushTags,
         npm: publish
      };

      var bumpSize = 'patch';
      var steps = this.args;

      if(steps.length && !actions.hasOwnProperty(steps[steps.length - 1])) {
         bumpSize = steps.pop();
      }

      if(!steps.length || steps[0] === 'all') {
         steps = ['bump', 'add', 'commit', 'tag', 'push', 'pushTags', 'npm'];
      }

      var options = taskOptions(this);

      steps = steps.filter(function(step) {
         if(options[step] !== false) {
            return options[step] = true;
         }
      });

      var config = setup(options, bumpSize);

      for(var i = 0, l = steps.length; i < l; i++) {
         var target = steps[i];

         if(actions.hasOwnProperty(target)) {
            actions[target](config);
         }
         else {
            grunt.log.error("Unknown target: " + target);
         }
      }
    });

    function setup(options, type){
      var file = options.file;
      var pkg = grunt.file.readJSON(file);
      var newVersion = pkg.version;
      if (options.bump) {
        newVersion = semver.inc(pkg.version, type || 'patch');
      }

      return {
         file: file,
         pkg: pkg,
         newVersion: newVersion,

         tagName: grunt.config.getRaw('release.options.tagName') || '<%= version %>',
         commitMessage: grunt.config.getRaw('release.options.commitMessage') || 'release <%= version %>',
         tagMessage: grunt.config.getRaw('release.options.tagMessage') || 'version <%= version %>',
         templateOptions: {
            data: {
               version: newVersion
            }
         }
      };
   }

    function add(config){
      run('git add ' + config.file);
    }

    function commit(config){
      var message = grunt.template.process(config.commitMessage, config.templateOptions);
      run('git commit '+ config.file +' -m "'+ message +'"', config.file + ' committed');
    }

    function tag(config){
      var name = grunt.template.process(config.tagName, config.templateOptions);
      var message = grunt.template.process(config.tagMessage, config.templateOptions);
      run('git tag ' + name + ' -m "'+ message +'"', 'New git tag created: ' + name);
    }

    function push(){
      run('git push', 'pushed to remote');
    }

    function pushTags(config){
      run('git push --tags', 'pushed new tag '+ config.newVersion +' to remote');
    }

    function publish(config){
      var cmd = 'npm publish';
      if (config.folder){ cmd += ' ' + config.folder }
      run(cmd, 'published '+ config.newVersion +' to npm');
    }

    function run(cmd, msg){
      shell.exec(cmd, {silent:true});
      if (msg) grunt.log.ok(msg);
    }

    function bump(config){
      config.pkg.version = config.newVersion;
      grunt.file.write(config.file, JSON.stringify(config.pkg, null, '  ') + '\n');
      grunt.log.ok('Version bumped to ' + config.newVersion);
    }

    function taskOptions(task) {
      return task.options({
         file: grunt.config('pkgFile') || 'package.json'
      });
    }

};
