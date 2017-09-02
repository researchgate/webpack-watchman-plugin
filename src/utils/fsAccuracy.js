/* @flow */
let FS_ACCURACY = 10000;

exports.revalidate = function revalidateFsAccuracy(mtime: number) {
    if (FS_ACCURACY === 1) return;

    if (FS_ACCURACY > 1 && mtime % 1 !== 0) FS_ACCURACY = 1;
    else if (FS_ACCURACY > 10 && mtime % 10 !== 0) FS_ACCURACY = 10;
    else if (FS_ACCURACY > 100 && mtime % 100 !== 0) FS_ACCURACY = 100;
    else if (FS_ACCURACY > 1000 && mtime % 1000 !== 0) FS_ACCURACY = 1000;
    else if (FS_ACCURACY > 2000 && mtime % 2000 !== 0) FS_ACCURACY = 2000;
};

exports.get = function getFsAccuracy() {
    return FS_ACCURACY;
};
