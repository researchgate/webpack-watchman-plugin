import test from 'ava';
import path from 'path';
import WatchmanConnector from '../src/WatchmanConnector';
import TestHelper from './helpers/TestHelper';

const projectPath = path.join(__dirname, 'fixtures');
const testHelper = new TestHelper(projectPath);

test.cb.before(t => testHelper.before(t.end));
test.cb.after(t => testHelper.after(t.end));

test('checks for options', t => {
  t.throws(() => new WatchmanConnector(), 'projectPath is missing for WatchmanPlugin');
});

test.beforeEach(t => {
  // eslint-disable-next-line no-param-reassign
  t.context.connector = new WatchmanConnector({ projectPath });
});

test.afterEach(t => {
  t.context.connector.close();
});

test.cb.serial('change is emitted for changed file', t => {
  t.plan(2);
  const connector = t.context.connector;
  const filename = testHelper.generateFilename();
  const filePath = path.join(projectPath, filename);

  testHelper.file(filename);

  connector.watch([filePath], []);
  connector.on('change', (file, mtime) => {
    t.is(file, filePath);
    t.true(typeof mtime === 'number');
    t.end();
  });

  testHelper.tick(() => testHelper.mtime(filename, Date.now()));
});

test.cb.serial('aggregated is emitted', t => {
  t.plan(1);
  const connector = t.context.connector;
  const filename = testHelper.generateFilename();
  const filePath = path.join(projectPath, filename);

  connector.watch([filePath], []);
  connector.on('aggregated', (files) => {
    t.deepEqual(files, [filePath]);
    t.end();
  });

  testHelper.tick(() => testHelper.file(filename));
});

test.cb.serial('change is not emitted during initialScan', t => {
  t.plan(1);
  const connector = t.context.connector;
  const filename = testHelper.generateFilename();
  const filePath = path.join(projectPath, filename);

  connector.watch([filePath], []);
  connector.on('change', () => t.fail('Should not trigger change'));

  testHelper.tick(() => {
    connector.initialScan = true;
    testHelper.file(filename);

    testHelper.tick(() => {
      t.is(connector.initialScanQueue.size, 1);
      t.end();
    });
  });
});
