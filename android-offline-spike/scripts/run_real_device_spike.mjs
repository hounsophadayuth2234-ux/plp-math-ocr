import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = path.resolve('android-offline-spike/platform-tools/adb.exe');
const MODEL_LOCAL = path.resolve('android-offline-spike/models/Qwen2.5-Math-1.5B-Instruct.Q5_K_S.gguf');
const REMOTE_DIR = '/data/local/tmp/models';
const REMOTE_MODEL = `${REMOTE_DIR}/Qwen2.5-Math-1.5B-Instruct.Q5_K_S.gguf`;

function runAdb(cmd) {
  return execSync(`"${ADB}" ${cmd}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();
}

console.log('Checking ADB devices...');
const devicesOutput = runAdb('devices -l');
console.log(devicesOutput);

if (!devicesOutput.includes('be48f0a1') || !devicesOutput.includes('device')) {
  console.log('DEVICE STATUS: DISCONNECTED / UNAVAILABLE');
  console.log('Device be48f0a1 is not currently detected on USB bus.');
  process.exit(1);
}

console.log('Device detected. Preparing remote directories...');
runAdb(`shell mkdir -p ${REMOTE_DIR}`);

console.log(`Pushing model ${MODEL_LOCAL} to ${REMOTE_MODEL}...`);
const pushOut = runAdb(`push "${MODEL_LOCAL}" "${REMOTE_MODEL}"`);
console.log(pushOut);

console.log('Verifying on-device SHA-256...');
const remoteSha = runAdb(`shell sha256sum "${REMOTE_MODEL}"`);
console.log('Remote SHA-256:', remoteSha);

console.log('Collecting thermal and battery telemetry under load...');
const thermal = runAdb('shell dumpsys thermalservice');
const battery = runAdb('shell dumpsys battery');
const meminfo = runAdb('shell dumpsys meminfo');

fs.writeFileSync('android-offline-spike/evidence/30_remote_model_push.txt', `${pushOut}\n${remoteSha}`, 'utf8');
fs.writeFileSync('android-offline-spike/evidence/31_telemetry_post_push.txt', `THERMAL:\n${thermal}\n\nBATTERY:\n${battery}\n\nMEMINFO:\n${meminfo}`, 'utf8');
console.log('Saved push and telemetry evidence.');

