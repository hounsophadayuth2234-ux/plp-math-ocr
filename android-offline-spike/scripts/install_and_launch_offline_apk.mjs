import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = path.resolve('android-offline-spike/platform-tools/adb.exe');
const APK = path.resolve('android-offline-spike/evidence/app-offline-release.apk');

console.log('[Installer] Starting installation of Phase 4 Offline Standalone APK...');
console.log('Target Device: OnePlus Pad 3 (be48f0a1)');
console.log('APK Path:', APK);
console.log(`APK Size: ${(fs.statSync(APK).size / (1024*1024)).toFixed(2)} MB`);

// 1. Uninstall any previous build to ensure clean certificate registration
try {
  console.log('[Installer] Uninstalling previous hybrid package com.dytcore.plpmath...');
  const uninstOut = execSync(`"${ADB}" uninstall com.dytcore.plpmath`, { encoding: 'utf8' });
  console.log('Uninstall Output:', uninstOut.trim());
} catch (e) {
  console.log('Uninstall note (package might not exist):', e.stdout || e.message);
}

// 2. Install new offline APK
console.log('[Installer] Sideloading Phase 4 Offline APK...');
try {
  const installOut = execSync(`"${ADB}" install -r -d "${APK}"`, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  console.log('Install Output:', installOut.trim());
  fs.writeFileSync('android-offline-spike/evidence/78_offline_apk_install.txt', installOut, 'utf8');
} catch (e) {
  console.error('Install Error:', e.stdout || e.message);
  fs.writeFileSync('android-offline-spike/evidence/78_offline_apk_install.txt', e.stdout || e.message, 'utf8');
  process.exit(1);
}

// 3. Verify installed package details on device
console.log('[Installer] Verifying package status on device...');
const pkgQuery = execSync(`"${ADB}" shell pm list packages com.dytcore.plpmath`, { encoding: 'utf8' }).trim();
console.log('Package Query:', pkgQuery);

const dumpsysPkg = execSync(`"${ADB}" shell dumpsys package com.dytcore.plpmath`, { encoding: 'utf8' });
const filteredDump = dumpsysPkg.split('\n')
  .filter(l => /versionName|versionCode|codePath|nativeLibrary|signatures/i.test(l))
  .join('\n');
console.log('Package Dump Details:\n', filteredDump);

fs.writeFileSync('android-offline-spike/evidence/79_offline_apk_device_verification.txt', `${pkgQuery}\n${filteredDump}`, 'utf8');

// 4. Clear logcat and launch the offline app
console.log('[Installer] Launching com.dytcore.plpmath/.MainActivity...');
execSync(`"${ADB}" logcat -c`, { encoding: 'utf8' });
const launchOut = execSync(`"${ADB}" shell am start -n com.dytcore.plpmath/com.dytcore.plpmath.MainActivity`, { encoding: 'utf8' });
console.log('Launch Output:', launchOut.trim());

// 5. Wait 3 seconds for UI rendering and lifecycle stabilization
console.log('[Installer] Waiting 3s for WebKit/Tauri UI rendering...');
execSync(`powershell -Command "Start-Sleep -Seconds 3"`);

// 6. Query memory PSS and running process
const psOut = execSync(`"${ADB}" shell "ps -A | grep plpmath"`, { encoding: 'utf8' }).trim();
console.log('Running Process:\n', psOut);

const meminfoOut = execSync(`"${ADB}" shell dumpsys meminfo com.dytcore.plpmath`, { encoding: 'utf8' });
console.log('Meminfo Summary:');
const pssLines = meminfoOut.split('\n').filter(l => /TOTAL PSS|TOTAL RSS|Native Heap|Dalvik Heap/i.test(l));
console.log(pssLines.join('\n'));

fs.writeFileSync('android-offline-spike/evidence/80_offline_app_meminfo.txt', `${psOut}\n\n${meminfoOut}`, 'utf8');

// 7. Capture tablet screenshot to verify offline UI
console.log('[Installer] Capturing screenshot of running offline application...');
execSync(`"${ADB}" shell screencap -p /data/local/tmp/screen_offline.png`);
execSync(`"${ADB}" pull /data/local/tmp/screen_offline.png "android-offline-spike/evidence/81_screen_offline_running.png"`);
console.log('Saved screenshot to android-offline-spike/evidence/81_screen_offline_running.png');

// 8. Capture logcat to confirm zero network connection errors
const logcatOut = execSync(`"${ADB}" logcat -d`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const last100Lines = logcatOut.split('\n').slice(-100).join('\n');
fs.writeFileSync('android-offline-spike/evidence/82_offline_app_logcat.txt', last100Lines, 'utf8');
console.log('All Phase 4 on-device deployment evidence successfully collected!');
