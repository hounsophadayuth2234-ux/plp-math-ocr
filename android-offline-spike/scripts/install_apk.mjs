import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = path.resolve('android-offline-spike/platform-tools/adb.exe');
const APK = path.resolve('android-offline-spike/evidence/app-release.apk');

console.log('Installing standalone APK to OnePlus Pad 3 (be48f0a1)...');
console.log('APK Path:', APK);
console.log(`APK Size: ${(fs.statSync(APK).size / (1024*1024)).toFixed(2)} MB`);

try {
  const installOut = execSync(`"${ADB}" install -r -d "${APK}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  console.log('Install Output:', installOut);
  fs.writeFileSync('android-offline-spike/evidence/73_apk_install.txt', installOut, 'utf8');
} catch (e) {
  console.error('Install Error:', e.stdout || e.message);
  fs.writeFileSync('android-offline-spike/evidence/73_apk_install.txt', e.stdout || e.message, 'utf8');
  process.exit(1);
}

console.log('Verifying installed package on device...');
const pkgList = execSync(`"${ADB}" shell pm list packages com.dytcore.plpmath`, { encoding: 'utf8' }).trim();
console.log('Package query:', pkgList);

console.log('Querying package dump for installed paths...');
const pkgDump = execSync(`"${ADB}" shell dumpsys package com.dytcore.plpmath`, { encoding: 'utf8' });
const lines = pkgDump.split('\n').filter(l => /versionName|versionCode|codePath|nativeLibrary/i.test(l));
console.log('Package Details:\n', lines.join('\n'));

fs.writeFileSync('android-offline-spike/evidence/74_apk_device_verification.txt', `${pkgList}\n${lines.join('\n')}`, 'utf8');
console.log('Saved APK install and verification evidence.');

