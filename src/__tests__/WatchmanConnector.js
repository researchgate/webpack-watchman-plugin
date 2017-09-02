/* eslint-env jest */
import path from 'path';
import fs from 'fs-extra';
import WatchmanConnector from '../WatchmanConnector';
import TestHelper from '../../test/TestHelper';

const tempPath = path.join(__dirname, '../../test/temp');

describe('WatchmanConnector', () => {
    let connector;
    let projectPath;
    let testHelper;

    beforeEach(() => {
        const pathName = Math.floor(Math.random() * 10000000000 + new Date().getTime());
        projectPath = path.join(tempPath, pathName.toString());
        connector = new WatchmanConnector({ projectPath });
        testHelper = new TestHelper(projectPath);

        return new Promise(resolve => testHelper.before(resolve));
    });

    afterEach(() => {
        connector.close();

        return new Promise(resolve => testHelper.after(resolve));
    });

    afterAll(() => {
        return new Promise(resolve => fs.remove(tempPath, resolve));
    });

    test('can be closed without prior start', () => {
        expect(() => connector.close()).not.toThrow();
    });

    test('checks for options', () => {
        expect(() => new WatchmanConnector()).toThrow('projectPath is missing for WatchmanPlugin');
    });

    test('change is emitted for changed file', done => {
        expect.assertions(2);
        const filename = TestHelper.generateFilename();
        const filePath = path.join(projectPath, filename);

        connector.on('change', (file, mtime) => {
            expect(file).toBe(filePath);
            expect(typeof mtime).toBe('number');
            done();
        });

        testHelper.file(filename, () => {
            // timeout so the new file is not picked up as change
            TestHelper.tick(() => {
                connector.watch([filePath], [], Date.now(), () => {
                    testHelper.mtime(filename, Date.now());
                });
            }, 1000);
        });
    });

    test('aggregated is emitted', done => {
        expect.assertions(1);
        const filename = TestHelper.generateFilename();
        const filePath = path.join(projectPath, filename);

        connector.on('aggregated', files => {
            expect(files).toEqual([filePath]);
            done();
        });
        connector.watch([filePath], [], Date.now(), () => {
            testHelper.file(filename);
        });
    });

    test('change is not emitted during initialScan', done => {
        expect.assertions(1);
        const filename = TestHelper.generateFilename();
        const filePath = path.join(projectPath, filename);

        connector.on('change', () => {
            throw new Error('Should not trigger change');
        });

        connector.watch([filePath], [], Date.now(), () => {
            connector.initialScan = true;
            testHelper.file(filename, () => {
                TestHelper.tick(() => {
                    expect(connector.initialScanChanged.length).toBe(1);
                    done();
                });
            });
        });
    });

    test('change before starting watch is correctly emitted', done => {
        expect.assertions(2);
        const oldDate = Date.now();
        const filename = TestHelper.generateFilename();
        const filePath = path.join(projectPath, filename);

        connector.on('change', (file, mtime) => {
            expect(file).toBe(filePath);
            expect(typeof mtime).toBe('number');
            done();
        });

        TestHelper.tick(() => {
            testHelper.file(filename, () => {
                connector.watch([filePath], [], oldDate);
            });
        }, 1000);
    });
});
