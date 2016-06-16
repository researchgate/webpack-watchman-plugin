/* @flow */
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { Client } from 'fb-watchman';
import async from 'async';

type Options = { aggregateTimeout: number, projectPath: string};

export default class WatchmanConnector extends EventEmitter {

  aggregatedChanges: Array<string> = [];
  client: ?Client;
  connected: boolean = false;
  fileTimes: Object = {};
  options: Options;
  paused: boolean = true;
  timeoutRef: number = 0;

  constructor(options: Options = { aggregateTimeout: 200, projectPath: '' }): void {
    super();
    if (!options.projectPath) throw new Error('projectPath is missing for WatchmanPlugin');

    this.options = options;
  }

  watch(files: Array<string>, dirs: Array<string>) {
    this.paused = false;

    if (this.connected) return;

    // TODO files and dirs might change

    this._doInitialScan(files.concat(dirs));

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
                    files.concat(dirs).map(file => path.relative(this.options.projectPath, file)),
                    'wholename',
                  ],
                ],
                fields: ['name', 'mtime_ms'],
                since: clockResponse.clock,
                relative_root: watchResponse.relative_path,
              };

              client.on('subscription', this._onSubscription);

              client.command(['subscribe', watchResponse.watch, 'webpack_subscription', sub],
                subscribeError => {
                  if (subscribeError) throw subscribeError;
                });
            });
          });
      });
  }

  getTimes(): { [key: string]: number } {
    return this.fileTimes;
  }

  close(): void {
    this.paused = true;
    if (this.timeoutRef) clearTimeout(this.timeoutRef);

    // Create variable for flow
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

  _onSubscription = (resp: Object): void => {
    resp.files.forEach(file => {
      if (resp.subscription === 'webpack_subscription') {
        this._setFileTime(file.name, file.mtime_ms);
        this._onChange(file.name, file.mtime_ms);
      }
    });
  };

  _setFileTime(file: string, mtime: number): void {
    this.fileTimes[file] = mtime;
  }

  _onChange(file: string, mtime: number): void {
    this._setFileTime(file, mtime);

    if (this.paused) return;

    this.emit('change', file, mtime);

    this._handleAggregated(file);
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
      // Create variable for flow
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
    async.each(files, (file, callback) => {
      fs.stat(file, (err, stat) => {
        if (err) {
          callback(err);
          return;
        }

        this._setFileTime(file, +stat.mtime);
        callback();
      });
    });
  }
}
