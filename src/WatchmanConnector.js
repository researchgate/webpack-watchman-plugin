/* @flow */
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { Client } from 'fb-watchman';
import async from 'async';

type Options = { aggregateTimeout: number, projectPath: string};

type WatchmanResponse = {
  subscription: string,
  files: Array<{ name: string, mtime_ms: number, 'new': boolean, exists: boolean }>
};

export default class WatchmanConnector extends EventEmitter {

  aggregatedChanges: Array<string> = [];
  client: ?Client;
  connected: boolean = false;
  fileTimes: Object = {};
  options: Options;
  paused: boolean = true;
  timeoutRef: number = 0;
  initialScan: boolean = true;
  initialScanRemoved: boolean = false;
  initialScanQueue: Set<{ name: string, mtime: number }> = new Set();

  constructor(options: Options = { aggregateTimeout: 200, projectPath: '' }): void {
    super();
    if (!options.projectPath) throw new Error('projectPath is missing for WatchmanPlugin');

    this.options = options;
  }

  watch(files: Array<string>, dirs: Array<string>) {
    this.paused = false;

    if (this.connected) return;

    const allFiles = files.concat(dirs);
    const client = this._getClientInstance();

    client.capabilityCheck({ optional: [], required: ['cmd-watch-project', 'relative_root'] },
      capabilityErr => {
        if (capabilityErr) throw capabilityErr;

        // Initiate the watch
        client.command(['watch-project', this.options.projectPath],
          (watchError, watchResponse) => {
            if (watchError) throw watchError;

            if (watchResponse.warning) {
              console.log('warning: ', watchResponse.warning); // eslint-disable-line no-console
            }

            client.command(['clock', watchResponse.watch], (clockError, clockResponse) => {
              if (clockError) throw clockError;

              const sub = {
                expression: [
                  'allof',
                  [
                    'name',
                    allFiles.map(file => path.relative(this.options.projectPath, file)),
                    'wholename',
                  ],
                ],
                fields: ['name', 'mtime_ms', 'exists'],
                since: clockResponse.clock,
                relative_root: watchResponse.relative_path,
              };

              client.on('subscription', this._onSubscription);

              client.command(['subscribe', watchResponse.watch, 'webpack_subscription', sub],
                subscribeError => {
                  if (subscribeError) throw subscribeError;
                });
            });
          }
        );
      }
    );

    this._doInitialScan(allFiles);
  }

  getTimes(): { [key: string]: number } {
    return this.fileTimes;
  }

  close(): void {
    this.paused = true;
    if (this.timeoutRef) clearTimeout(this.timeoutRef);

    const client = this.client;
    if (client) {
      client.removeListener('subscription', this._onSubscription);
      client.command(['unsubscribe', this.options.projectPath, 'webpack_subscription']);
      client.end();
      this.client = null;
    }
  }

  pause(): void {
    this.paused = true;
    if (this.timeoutRef) clearTimeout(this.timeoutRef);
  }

  _onSubscription = (resp: WatchmanResponse): void => {
    if (resp.subscription === 'webpack_subscription') {
      resp.files.forEach(file => {
        const filePath = path.join(this.options.projectPath, file.name);
        const mtime = (!file.exists) ? null : +file.mtime_ms;

        this._setFileTime(filePath, mtime);

        if (this.initialScan) {
          if (mtime) {
            this.initialScanQueue.add({ name: filePath, mtime });
          } else {
            this.initialScanRemoved = true;
          }
          return;
        }

        if (this.paused || !file.exists) return;

        this._handleEvents(filePath, mtime);
      });
    }
  };

  _setFileTime(file: string, mtime: ?number): void {
    this.fileTimes[file] = mtime;
  }

  _handleEvents(filePath: string, mtime: ?number): void {
    this.emit('change', filePath, mtime);

    this._handleAggregated(filePath);
  }

  _handleAggregated(file: string): void {
    if (this.timeoutRef) clearTimeout(this.timeoutRef);

    if (this.aggregatedChanges.indexOf(file) < 0) {
      this.aggregatedChanges.push(file);
    }

    this.timeoutRef = setTimeout(this._onTimeout, this.options.aggregateTimeout);
  }

  _getClientInstance(): Client {
    if (!this.client) {
      const client = new Client();
      client.on('connect', () => { this.connected = true; });
      client.on('end', () => { this.connected = false; });

      this.client = client;
    }

    return this.client;
  }

  _onTimeout = (): void => {
    this.timeoutRef = 0;
    const changes = this.aggregatedChanges;
    this.aggregatedChanges = [];

    this.emit('aggregated', changes);
  };

  _doInitialScan(files: Array<string>): void {
    async.eachLimit(files, 100, (file, callback) => {
      fs.stat(file, (err, stat) => {
        if (err) {
          callback(err);
          return;
        }

        this._setFileTime(file, +stat.mtime);
        callback();
      });
    }, () => {
      this.initialScan = false;

      if (this.initialScanQueue.size > 0) {
        const file = Array.from(this.initialScanQueue)[this.initialScanQueue.size - 1];
        this._handleEvents(file.name, file.mtime);
      }

      if (this.initialScanRemoved) {
        this.emit('remove');
      }

      this.initialScanRemoved = false;
      this.initialScanQueue.clear();
    });
  }
}
