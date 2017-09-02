/* @flow */
import async from 'async';
import createDebug from 'debug';
import EventEmitter from 'events';
import { Client } from 'fb-watchman';
import fs from 'fs';
import path from 'path';
import fsAccurency from './utils/fsAccuracy';

const debug = createDebug('watchman:connector');

type Options = { aggregateTimeout: number, projectPath: string };

type WatchmanResponse = {
    clock: string,
    subscription: string,
    files: Array<{
        name: string,
        mtime_ms: number,
        new: boolean,
        exists: boolean,
    }>,
};

export default class WatchmanConnector extends EventEmitter {
    aggregatedChanges: Array<string> = [];
    aggregatedRemovals: Array<string> = [];
    client: ?Client;
    connected: boolean = false;
    lastClock: string;
    fileTimes: Object = {};
    options: Options;
    paused: boolean = true;
    timeoutRef: number = 0;
    initialScan: boolean = true;
    initialScanRemoved: Array<string> = [];
    initialScanChanged: Array<{ name: string, mtime: number }> = [];

    constructor(options: Options = { aggregateTimeout: 200, projectPath: '' }): void {
        super();
        if (!options.projectPath) {
            throw new Error('projectPath is missing for WatchmanPlugin');
        }

        this.options = options;
    }

    /**
   * `since` has to be either a string with a watchman clock value, or a number
   * which is then treated as a timestamp in milliseconds
   */
    watch(files: Array<string>, dirs: Array<string>, since: string | number, done?: () => void) {
        debug(`watch() called, current connection status: ${this.connected ? 'connected' : 'disconnected'}`);
        this.paused = false;

        if (this.connected) return;

        const allFiles = files.concat(dirs);

        Promise.all([
            new Promise((resolve, reject) => {
                this.startWatch(allFiles, since, err => (err ? reject(err) : resolve()));
            }),
            new Promise(resolve => {
                this.doInitialScan(allFiles, resolve);
            }),
        ])
            .catch(err => {
                throw err;
            })
            .then(() => (done ? done() : null));
    }

    getTimes(): { [key: string]: number } {
        return this.fileTimes;
    }

    close(): void {
        debug('close() called');
        this.paused = true;
        if (this.timeoutRef) clearTimeout(this.timeoutRef);
        this.removeAllListeners();

        const client = this.client;
        if (client) {
            client.removeListener('subscription', this.handleSubscription);
            client.command(['unsubscribe', this.options.projectPath, 'webpack_subscription']);
            client.end();
            this.client = null;
        }
    }

    pause(): void {
        debug('pause() called');
        this.paused = true;
        if (this.timeoutRef) clearTimeout(this.timeoutRef);
    }

    startWatch(files: Array<string>, since: string | number, done: (?Error) => void): void {
        const client = this.getClientInstance();

        client.capabilityCheck({ optional: [], required: ['cmd-watch-project', 'relative_root'] }, capabilityErr => {
            /* istanbul ignore if: cannot happen in tests */
            if (capabilityErr) {
                done(capabilityErr);
                return;
            }
            debug('watchman capabilityCheck() successful');

            // Initiate the watch
            client.command(['watch-project', this.options.projectPath], (watchError, watchResponse) => {
                /* istanbul ignore if: cannot happen in tests */
                if (watchError) {
                    done(watchError);
                    return;
                }
                debug('watchman command watch-project successful');

                /* istanbul ignore if: cannot happen in tests */
                if (watchResponse.warning) {
                    console.warn('warning: ', watchResponse.warning); // eslint-disable-line no-console
                }

                const sub = {
                    expression: [
                        'allof',
                        ['name', files.map(file => path.relative(this.options.projectPath, file)), 'wholename'],
                    ],
                    fields: ['name', 'mtime_ms', 'exists'],
                    since: typeof since === 'string' ? since : Math.floor(since / 1000),
                    // eslint-disable-next-line camelcase
                    relative_root: watchResponse.relative_path,
                };

                client.on('subscription', this.handleSubscription);

                debug('watchman command subscription data: ', sub);

                client.command(['subscribe', watchResponse.watch, 'webpack_subscription', sub], subscribeError => {
                    /* istanbul ignore if: cannot happen in tests */
                    if (subscribeError) {
                        done(subscribeError);
                        return;
                    }
                    debug('watchman command subscribe successful');
                    done();
                });
            });
        });
    }

    handleSubscription = (resp: WatchmanResponse): void => {
        debug('received subscription: %O', resp);
        if (resp.subscription === 'webpack_subscription') {
            this.lastClock = resp.clock;
            resp.files.forEach(file => {
                const filePath = path.join(this.options.projectPath, file.name);

                if (this.paused) return;

                if (!file.exists) this.handleRemove(filePath);
                else this.handleChange(filePath, +file.mtime_ms);
            });
        }
    };

    setFileTime(file: string, mtime: number): void {
        fsAccurency.revalidate(mtime);
        this.fileTimes[file] = mtime + fsAccurency.get();
    }

    handleChange(filePath: string, mtime: number): void {
        if (this.initialScan) {
            this.initialScanChanged.push({ name: filePath, mtime });
            return;
        }

        this.setFileTime(filePath, mtime);

        if (this.paused) return;

        this.emit('change', filePath, mtime);

        this.handleAggregatedChange(filePath);
    }

    handleAggregatedChange(file: string): void {
        if (this.timeoutRef) clearTimeout(this.timeoutRef);

        if (this.aggregatedChanges.indexOf(file) < 0) {
            this.aggregatedChanges.push(file);
        }

        this.timeoutRef = setTimeout(this.handleTimeout, this.options.aggregateTimeout);
    }

    handleRemove(filePath: string): void {
        if (this.initialScan) {
            this.initialScanRemoved.push(filePath);
            return;
        }

        delete this.fileTimes[filePath];

        if (this.paused) return;

        this.emit('remove', filePath);

        this.handleAggregatedRemove(filePath);
    }

    handleAggregatedRemove(file: string): void {
        if (this.timeoutRef) clearTimeout(this.timeoutRef);

        if (this.aggregatedRemovals.indexOf(file) < 0) {
            this.aggregatedRemovals.push(file);
        }

        this.timeoutRef = setTimeout(this.handleTimeout, this.options.aggregateTimeout);
    }

    getClientInstance(): Client {
        if (!this.client) {
            const client = new Client();
            client.on('connect', () => {
                this.connected = true;
            });
            client.on('end', () => {
                this.connected = false;
            });

            this.client = client;
        }

        return this.client;
    }

    handleTimeout = (): void => {
        this.timeoutRef = 0;
        const changes = this.aggregatedChanges;
        const removals = this.aggregatedRemovals;
        this.aggregatedChanges = [];
        this.aggregatedRemovals = [];

        this.emit('aggregated', changes, removals, this.lastClock);
    };

    doInitialScan(files: Array<string>, done: () => void): void {
        debug('starting initial file scan');
        async.eachLimit(
            files,
            500,
            (file, callback) => {
                fs.stat(file, (err, stat) => {
                    if (err) {
                        callback(err);
                        return;
                    }

                    const mtime = +stat.mtime;
                    fsAccurency.revalidate(mtime);

                    this.setFileTime(file, mtime);
                    callback();
                });
            },
            () => {
                this.initialScan = false;
                debug('initial file scan finished');

                if (this.initialScanChanged.length > 0) {
                    this.initialScanChanged.map(file => this.handleChange(file.name, file.mtime));
                }

                if (this.initialScanRemoved.length > 0) {
                    this.initialScanRemoved.map(file => this.handleRemove(file));
                }

                this.initialScanChanged = [];
                this.initialScanRemoved = [];
                done();
            },
        );
    }
}
