# Bitovi Open Source project webpage shared

Shared Stylesheets, JavaScript, templates etc. for the Bitovi open source project websites.

## Installation

This repository is most likely to be included as a submodule to project websites.

To use it standalone anyway, clone the repository and install all the dependencies
(you need [GruntJS](http://gruntjs.com) installed globally):

    git clone git@github.com:bitovi/shared-web.git
    cd shared-web
    npm install

Now you can run `grunt` to generate the shared production JavaScript.

## Folder structure

Folders starting with `_` won't show up on any homepage (Jekyll).

- `_js` - JavaScript (Controls, Models etc.) for the dynamic content on the pages
- `_styles` - Default LESS stylesheets (just `@include '_styles/styles.less'`)
- `_template` - Default page and Documentation templates
- `fonts` - Fancy Web fonts
- `resources` - Concatenated and minified JavaScript and other additional shared resources

## Deploy

When changing anything in this repository, all pages that use it should be updated to the latest version as well.
