# WatchmanPlugin for WebPack
###### A webpack plugin that integrates watchman as its watcher.

[![Build Status](https://travis-ci.org/researchgate/webpack-watchman-plugin.svg?branch=master)](https://travis-ci.org/researchgate/webpack-watchman-plugin)

> This plugin was tested with webpack 1.13+ and watchman 4.5+. This plugin makes use of undocumented webpack APIs, so probably the plugin needs
> to be adapted for new major versions (like webpack 2).

## Usage

Make sure [watchman][watchman] is [installed and ready to use][watchman-install] on your system.

`npm install --save-dev webpack-watchman-plugin`

```js
const webpackConfig = {
  plugins: [
    new WatchmanPlugin({ projectPath: path.join(__dirname, '/../') }),
  ],
};
```

## License

webpack-watchman-plugin is licensed under the MIT license.

[watchman]: https://facebook.github.io/watchman/
[watchman-install]: https://facebook.github.io/watchman/docs/install.html
