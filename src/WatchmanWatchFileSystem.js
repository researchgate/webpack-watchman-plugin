/* @flow */
import Watchman from './WatchmanConnector';

type Options = { projectPath: string };
type Callback = (
  err: ?Error,
  files: Array<string>,
  dirs: Array<string>,
  missing: Array<string>,
  filetimes: { [key: string]: number },
  dirtimes: { [key: string]: number },
) => void;

export default class WatchmanWatchFileSystem {

  inputFileSystem: Object;
  options: Options;
  watcher: Watchman;

  constructor(inputFileSystem: Object, options: Options): void {
    this.inputFileSystem = inputFileSystem;
    this.options = options;
  }

  watch(
    files: Array<string>,
    dirs: Array<string>,
    missing: Array<string>,
    startTime: number,
    options: Object,
    callback: Callback,
    callbackUndelayed: (file: string, mtime: number) => void
  ): { close: Function, pause: Function } {
    const oldWatcher = this.watcher;

    this.watcher = new Watchman(Object.assign({}, options, this.options));

    if (callbackUndelayed) {
      this.watcher.once('change', callbackUndelayed);
    }

    this.watcher.once('aggregated', changes => {
      if (this.inputFileSystem && this.inputFileSystem.purge) {
        this.inputFileSystem.purge(changes);
      }

      const times = this.watcher.getTimes();

      callback(
        null,
        changes.filter(file => files.indexOf(file) >= 0).sort(),
        changes.filter(file => dirs.indexOf(file) >= 0).sort(),
        changes.filter(file => missing.indexOf(file) >= 0).sort(),
        times,
        times
      );
    });

    this.watcher.watch(files.concat(missing), dirs, startTime);

    if (oldWatcher) oldWatcher.close();

    return {
      close: () => this.watcher.close(),
      pause: () => this.watcher.pause(),
    };
  }
}
