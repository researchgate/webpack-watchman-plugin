/* @flow */
import WatchFileSystem from './WatchmanWatchFileSystem';

type Options = { projectPath: string };

export default class WatchmanPlugin {

  options: Options;

  constructor(options: Options = { projectPath: '' }): void {
    if (!options.projectPath) throw new Error('projectPath is missing for WatchmanPlugin');

    this.options = options;
  }

  apply(compiler: Object): void {
    compiler.plugin('environment', () => {
      compiler.watchFileSystem = new WatchFileSystem( // eslint-disable-line no-param-reassign
        compiler.inputFileSystem,
        this.options
      );
    });
  }
}
