/* @flow */
let FS_ACCURENCY = 10000;

exports.revalidate = function revalidateFsAccurency(mtime: number) {
  if (FS_ACCURENCY === 1) return;

  if (FS_ACCURENCY > 1 && mtime % 1 !== 0) FS_ACCURENCY = 1;
  else if (FS_ACCURENCY > 10 && mtime % 10 !== 0) FS_ACCURENCY = 10;
  else if (FS_ACCURENCY > 100 && mtime % 100 !== 0) FS_ACCURENCY = 100;
  else if (FS_ACCURENCY > 1000 && mtime % 1000 !== 0) FS_ACCURENCY = 1000;
  else if (FS_ACCURENCY > 2000 && mtime % 2000 !== 0) FS_ACCURENCY = 2000;
};

exports.get = function getFsAccurency() {
  return FS_ACCURENCY;
};
