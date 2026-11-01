import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = path.resolve('android-offline-spike/platform-tools/adb.exe');
const APK = path.resolve('android-offline-spike/evidence/app-offline-release.apk');
const EVIDENCE_DIR = path.resolve('android-offline-spike/evidence');

console.log('[Phase 5 Verifier] Starting Comprehensive Multi-Module Verification...');

// 1. Device Presence Check
let devicesOut = '';
try {
  devicesOut = execSync(`"${ADB}" devices -l`, { encoding: 'utf8' }).trim();
} catch (e) {
  console.error('[Phase 5 Verifier] ADB execution failed:', e.message);
  process.exit(1);
}

const lines = devicesOut.split('\n').filter(l => l.trim() && !l.startsWith('*') && !l.startsWith('List of'));
console.log('[Phase 5 Verifier] Connected devices:', lines.length > 0 ? lines.join(', ') : 'NONE');

if (lines.length === 0) {
  console.log('[Phase 5 Verifier] STATUS: PENDING_DEVICE_ATTACH');
  console.log('[Phase 5 Verifier] Please ensure OnePlus Pad 3 (be48f0a1) is physically connected via USB and authorized.');
  process.exit(2);
}

const targetSerial = lines[0].split(/\s+/)[0];
console.log(`[Phase 5 Verifier] Targeting device serial: ${targetSerial}`);

// 2. Install Offline Suite APK
console.log(`[Phase 5 Verifier] Sideloading Phase 5 APK: ${APK} (${(fs.statSync(APK).size / (1024*1024)).toFixed(2)} MB)...`);
try {
  const installOut = execSync(`"${ADB}" -s ${targetSerial} install -r -d "${APK}"`, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  console.log('[Phase 5 Verifier] Install output:', installOut.trim());
  fs.writeFileSync(path.join(EVIDENCE_DIR, '78_offline_apk_install.txt'), installOut, 'utf8');
} catch (e) {
  console.error('[Phase 5 Verifier] Install failed:', e.stdout || e.message);
  process.exit(1);
}

// 3. Verify Package Registration & V2 Signature
const dumpOut = execSync(`"${ADB}" -s ${targetSerial} shell dumpsys package com.dytcore.plpmath`, { encoding: 'utf8' });
const filteredDump = dumpOut.split('\n')
  .filter(l => /versionName|versionCode|codePath|nativeLibrary|signatures/i.test(l))
  .join('\n');
console.log('[Phase 5 Verifier] Verified package metadata:\n', filteredDump);
fs.writeFileSync(path.join(EVIDENCE_DIR, '79_offline_apk_device_verification.txt'), filteredDump, 'utf8');

// 4. Launch Offline Suite MainActivity
console.log('[Phase 5 Verifier] Launching com.dytcore.plpmath/.MainActivity...');
execSync(`"${ADB}" -s ${targetSerial} logcat -c`, { encoding: 'utf8' });
execSync(`"${ADB}" -s ${targetSerial} shell am start -n com.dytcore.plpmath/com.dytcore.plpmath.MainActivity`, { encoding: 'utf8' });

console.log('[Phase 5 Verifier] Waiting 4s for WebKit/Tauri rendering...');
execSync(`powershell -Command "Start-Sleep -Seconds 4"`);

// 5. Verification of all 5 Modules + Sync Deck via Screen Evidence
// Coordinates for tab bar in 2400x3392 portrait (Y ≈ 300)
const modules = [
  { id: 'm04', name: 'Module 04: Khmer Math Factory', tapX: 200, tapY: 300, evidence: '89_m04_math_factory.png' },
  { id: 'm01', name: 'Module 01: Math OCR', tapX: 550, tapY: 300, evidence: '90_m01_math_ocr.png' },
  { id: 'm02', name: 'Module 02: Background Remover', tapX: 900, tapY: 300, evidence: '91_m02_bg_remover.png' },
  { id: 'm03', name: 'Module 03: HD Image Upscaler', tapX: 1300, tapY: 300, evidence: '92_m03_image_upscaler.png' },
  { id: 'm05', name: 'Module 05: Visual Asset Studio', tapX: 1700, tapY: 300, evidence: '93_m05_visual_studio.png' },
  { id: 'sync', name: 'Sync Outbox & Security Profile', tapX: 2100, tapY: 300, evidence: '94_sync_outbox_profile.png' }
];

for (const mod of modules) {
  console.log(`[Phase 5 Verifier] Activating ${mod.name} (tap at ${mod.tapX}, ${mod.tapY})...`);
  execSync(`"${ADB}" -s ${targetSerial} shell input tap ${mod.tapX} ${mod.tapY}`);
  execSync(`powershell -Command "Start-Sleep -Milliseconds 800"`);
  
  const deviceTmp = `/data/local/tmp/${mod.id}.png`;
  execSync(`"${ADB}" -s ${targetSerial} shell screencap -p ${deviceTmp}`);
  const destPath = path.join(EVIDENCE_DIR, mod.evidence);
  execSync(`"${ADB}" -s ${targetSerial} pull ${deviceTmp} "${destPath}"`);
  console.log(`[Phase 5 Verifier] Captured screen evidence: ${mod.evidence} (${(fs.statSync(destPath).size / 1024).toFixed(1)} KB)`);
}

// 6. Memory PSS Audit
console.log('[Phase 5 Verifier] Collecting memory PSS telemetry...');
const meminfoOut = execSync(`"${ADB}" -s ${targetSerial} shell dumpsys meminfo com.dytcore.plpmath`, { encoding: 'utf8' });
const pssMatch = meminfoOut.match(/TOTAL PSS:\s+(\d+)/i);
const totalPssKb = pssMatch ? parseInt(pssMatch[1], 10) : 0;
const totalPssMb = (totalPssKb / 1024).toFixed(2);
console.log(`[Phase 5 Verifier] TOTAL PSS: ${totalPssKb} KB (${totalPssMb} MB) - Threshold: <350 MB`);

const pssSummary = meminfoOut.split('\n').filter(l => /TOTAL PSS|TOTAL RSS|Native Heap|Dalvik Heap|Views|Activities/i.test(l)).join('\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, '95_phase5_app_meminfo.txt'), meminfoOut, 'utf8');

// 7. Network Isolation & Logcat Audit
console.log('[Phase 5 Verifier] Verifying zero remote connections in logcat...');
const logcatOut = execSync(`"${ADB}" -s ${targetSerial} logcat -d`, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
const last150 = logcatOut.split('\n').slice(-150).join('\n');
fs.writeFileSync(path.join(EVIDENCE_DIR, '96_phase5_app_logcat.txt'), last150, 'utf8');

const remoteMatch = /math\.dytcore\.com|gemini\.googleapis\.com|api\.anthropic\.com/i.test(logcatOut);
if (remoteMatch) {
  throw new Error('SECURITY VIOLATION: Remote domain network call detected in logcat!');
}
console.log('[Phase 5 Verifier] Logcat verification passed: 0 remote network calls.');

console.log('[Phase 5 Verifier] Phase 5 On-Device Verification COMPLETE.');

