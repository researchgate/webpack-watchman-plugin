/* @flow */
import createDebug from 'debug';
import WatchFileSystem from './WatchmanWatchFileSystem';

const debug = createDebug('watchman:plugin');

type Options = { projectPath: string };

export default class WatchmanPlugin {
    options: Options;

    constructor(options: Options = { projectPath: '' }): void {
        if (!options.projectPath) {
            throw new Error('projectPath is missing for WatchmanPlugin');
        }

        this.options = options;
    }

    apply(compiler: Object): void {
        compiler.plugin('environment', () => {
            debug('creating new filesystem');
            compiler.watchFileSystem = new WatchFileSystem(compiler.inputFileSystem, this.options); // eslint-disable-line no-param-reassign
        });
    }
}
