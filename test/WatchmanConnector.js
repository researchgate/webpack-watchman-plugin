import test from 'ava';
import path from 'path';
import WatchmanConnector from '../src/WatchmanConnector';
import TestHelper from './helpers/TestHelper';

const projectPath = path.join(__dirname, 'fixtures');

test.cb.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.cwd = path.join(projectPath, t.title.replace(/ /g, '_'));
  // eslint-disable-next-line no-param-reassign
  t.context.connector = new WatchmanConnector({ projectPath: t.context.cwd });
  // eslint-disable-next-line no-param-reassign
  t.context.testHelper = new TestHelper(t.context.cwd);
  t.context.testHelper.before(t.end);
});

test.cb.afterEach((t) => {
  t.context.connector.close();
  t.context.testHelper.after(t.end);
});

test('can be closed without prior start', (t) => {
  t.notThrows(() => t.context.connector.close());
});

test('checks for options', (t) => {
  t.throws(() => new WatchmanConnector(), 'projectPath is missing for WatchmanPlugin');
});

test.cb('change is emitted for changed file', (t) => {
  t.plan(2);
  const { connector, cwd, testHelper } = t.context;
  const filename = TestHelper.generateFilename();
  const filePath = path.join(cwd, filename);

  testHelper.file(filename, () => {
    connector.watch([filePath], [], Date.now() + 1000);
    connector.on('change', (file, mtime) => {
      t.is(file, filePath);
      t.true(typeof mtime === 'number');
      t.end();
    });

    TestHelper.tick(() => testHelper.mtime(filename, Date.now()), 1500);
  });
});

test.cb('aggregated is emitted', (t) => {
  t.plan(1);
  const { connector, cwd, testHelper } = t.context;
  const filename = TestHelper.generateFilename();
  const filePath = path.join(cwd, filename);

  connector.watch([filePath], [], Date.now() + 1000);
  connector.on('aggregated', (files) => {
    t.deepEqual(files, [filePath]);
    t.end();
  });

  TestHelper.tick(() => testHelper.file(filename), 1500);
});

test.cb('change is not emitted during initialScan', (t) => {
  t.plan(1);
  const { connector, cwd, testHelper } = t.context;
  const filename = TestHelper.generateFilename();
  const filePath = path.join(cwd, filename);

  connector.watch([filePath], [], Date.now() + 1000);
  connector.on('change', () => t.fail('Should not trigger change'));

  TestHelper.tick(() => {
    connector.initialScan = true;
    testHelper.file(filename);

    TestHelper.tick(() => {
      t.is(connector.initialScanQueue.size, 1);
      t.end();
    });
  });
});
