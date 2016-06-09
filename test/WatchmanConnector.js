import test from 'ava';
import td from 'testdouble';
import { EventEmitter } from 'events';
import WatchmanConnector from '../lib/WatchmanConnector';

class WatchmanMock extends EventEmitter {
  command(command, callback) { callback(null, {}); }
  capabilityCheck(options, callback) { callback(null); }
}

let watchman;

function newConnector(...args) {
  const instance = new WatchmanConnector(...args);
  const stub = td.replace(instance, '_getClientInstance');
  watchman = new WatchmanMock();

  td.when(stub()).thenReturn(watchman);
  instance.paused = false;

  return instance;
}

test.afterEach.always(() => td.reset());

test('checks for options', t => {
  t.throws(() => newConnector(), 'projectPath is missing for WatchmanPlugin');
});

test.cb('change is emitted', t => {
  t.plan(2);
  const connector = newConnector({ projectPath: '/project' });
  connector.watch([], []);

  connector.on('change', (file, mtime) => {
    t.is(file, 'test.js');
    t.is(mtime, 123456789);
    t.end();
  });

  watchman.emit('subscription', {
    subscription: 'webpack_subscription',
    files: [
      { name: 'test.js', mtime_ms: 123456789 },
    ],
  });
});

test.cb('aggregated is emitted', t => {
  t.plan(1);
  const connector = newConnector({ projectPath: '/project' });
  connector.watch([], []);

  connector.on('aggregated', (file) => {
    t.deepEqual(file, ['test.js']);
    t.end();
  });

  watchman.emit('subscription', {
    subscription: 'webpack_subscription',
    files: [
      { name: 'test.js', mtime_ms: 123456789 },
    ],
  });
});
