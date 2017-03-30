/* @flow */
import createDebug from 'debug';
import Watchman from './WatchmanConnector';

const debug = createDebug('watchman:filesystem');

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
  watcher: ?Watchman;
  lastClock: string;

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
    callbackUndelayed: (file: string, mtime: number) => void,
  ): { close: Function, pause: Function } {
    if (!Array.isArray(files)) throw new Error("Invalid arguments: 'files'");
    if (!Array.isArray(dirs)) throw new Error("Invalid arguments: 'dirs'");
    if (!Array.isArray(missing)) throw new Error("Invalid arguments: 'missing'");
    if (typeof callback !== 'function') throw new Error("Invalid arguments: 'callback'");
    if (typeof startTime !== 'number' && startTime) throw new Error("Invalid arguments: 'startTime'");
    if (typeof options !== 'object') throw new Error("Invalid arguments: 'options'");
    if (typeof callbackUndelayed !== 'function' && callbackUndelayed) throw new Error("Invalid arguments: 'callbackUndelayed'");
    const oldWatcher = this.watcher;

    debug('creating new connector');
    const watcher = new Watchman(Object.assign({}, options, this.options));
    this.watcher = watcher;

    if (callbackUndelayed) {
      watcher.once('change', (filePath, mtime) => {
        debug('change event received for %s with mtime', filePath, mtime);
        callbackUndelayed(filePath, mtime);
      });
    }

    watcher.once('aggregated', (changes, removals, clock) => {
      this.lastClock = clock;
      const allChanges = changes.concat(removals);
      debug('aggregated event received with changes: ', changes);
      if (this.inputFileSystem && this.inputFileSystem.purge) {
        this.inputFileSystem.purge(allChanges);
      }

      const times = watcher.getTimes();

      callback(
        null,
        changes.filter(file => files.indexOf(file) >= 0).sort(),
        changes.filter(file => dirs.indexOf(file) >= 0).sort(),
        changes.filter(file => missing.indexOf(file) >= 0).sort(),
        times,
        times,
      );
    });

    watcher.watch(files.concat(missing), dirs, this.lastClock || startTime);

    if (oldWatcher) {
      debug('closing old connector');
      oldWatcher.close();
    }

    return {
      close: () => {
        if (this.watcher) {
          this.watcher.close();
          this.watcher = null;
        }
      },
      pause: () => {
        if (this.watcher) this.watcher.pause();
      },
    };
  }
}
