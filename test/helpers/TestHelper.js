const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

class TestHelper {

  constructor(testdir) {
    this.testdir = testdir;
  }

  before = done => {
    this.tick(() => {
      rimraf.sync(this.testdir);
      fs.mkdirSync(this.testdir);
      this.file('.watchmanconfig', '');
      done();
    });
  };

  after = done => {
    this.tick(() => {
      rimraf.sync(this.testdir);
      done();
    });
  };

  dir(name) {
    fs.mkdirSync(path.join(this.testdir, name));
  }

  generateFilename() {
    return `${Math.ceil(Math.random() * 10000)}${Date.now()}`;
  }

  file(name, content) {
    fs.writeFileSync(path.join(this.testdir, name), content || `${Math.random()}`, 'utf-8');
  }

  mtime(name, mtime) {
    const stats = fs.statSync(path.join(this.testdir, name));
    fs.utimesSync(path.join(this.testdir, name), stats.atime, new Date(mtime));
  }

  remove(name) {
    rimraf.sync(path.join(this.testdir, name));
  }

  tick(fn, timeout = 500) {
    setTimeout(fn, timeout);
  }
}

module.exports = TestHelper;
