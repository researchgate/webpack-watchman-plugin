const fs = require('fs-extra');
const path = require('path');

class TestHelper {

  constructor(testdir) {
    this.testdir = testdir;
  }

  before = (done) => {
    fs.remove(this.testdir, (removeErr) => {
      if (removeErr) throw removeErr;
      fs.mkdirs(this.testdir, (mkdirErr) => {
        if (mkdirErr) throw mkdirErr;
        this.file('.watchmanconfig', '');
        done();
      });
    });
  };

  after = (done) => {
    fs.remove(this.testdir, (removeErr) => {
      if (removeErr) throw removeErr;
      done();
    });
  };

  dir(name) {
    fs.mkdirSync(path.join(this.testdir, name));
  }

  static generateFilename() {
    return `${Math.ceil(Math.random() * 10000)}${Date.now()}`;
  }

  file(name, content, done) {
    if (!done && typeof content === 'function') {
      // eslint-disable-next-line no-param-reassign
      done = content;
      // eslint-disable-next-line no-param-reassign
      content = null;
    }
    fs.writeFile(path.join(this.testdir, name), content || `${Math.random()}`, 'utf-8', (err) => { if (err) throw err; if (done) done(); });
  }

  mtime(name, mtime) {
    const filePath = path.join(this.testdir, name);
    fs.stat(filePath, (err, stat) => {
      if (err) throw err;

      fs.utimes(
        filePath,
        stat.atime,
        new Date(mtime),
        (utimesErr) => { if (utimesErr) throw utimesErr; },
      );
    });
  }

  remove(name) {
    fs.remove(path.join(this.testdir, name), (err) => { if (err) throw err; });
  }

  static tick(fn, timeout = 500) {
    setTimeout(fn, timeout);
  }
}

module.exports = TestHelper;
