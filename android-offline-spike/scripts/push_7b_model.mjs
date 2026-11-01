import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB = path.resolve('android-offline-spike/platform-tools/adb.exe');
const MODEL_LOCAL = path.resolve('android-offline-spike/models/Qwen2.5-Math-7B-Instruct-Q4_K_M.gguf');
const REMOTE_DIR = '/data/local/tmp/models';
const REMOTE_MODEL = `${REMOTE_DIR}/Qwen2.5-Math-7B-Instruct-Q4_K_M.gguf`;

function runAdb(cmd) {
  return execSync(`"${ADB}" ${cmd}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();
}

console.log('Verifying ADB connection...');
const dev = runAdb('devices -l');
console.log(dev);

console.log(`Starting push of production 7B model (${(fs.statSync(MODEL_LOCAL).size / (1024*1024*1024)).toFixed(3)} GB) to ${REMOTE_MODEL}...`);
const pushOut = runAdb(`push "${MODEL_LOCAL}" "${REMOTE_MODEL}"`);
console.log('Push output:', pushOut);

console.log('Verifying remote SHA-256 on OnePlus Pad 3...');
const shaOut = runAdb(`shell sha256sum "${REMOTE_MODEL}"`);
console.log('Remote SHA-256:', shaOut);

console.log('Measuring UFS 4.0 storage direct read throughput for 7B model...');
const ufsOut = runAdb(`shell time dd if="${REMOTE_MODEL}" of=/dev/null bs=4M`);
console.log('UFS Throughput:', ufsOut);

console.log('Collecting post-transfer telemetry (thermal, battery, meminfo)...');
const thermal = runAdb('shell dumpsys thermalservice');
const battery = runAdb('shell dumpsys battery');
const meminfo = runAdb('shell dumpsys meminfo');

fs.writeFileSync('android-offline-spike/evidence/65_remote_7b_model_push.txt', `${pushOut}\n${shaOut}\nUFS_READ:\n${ufsOut}`, 'utf8');
fs.writeFileSync('android-offline-spike/evidence/66_telemetry_post_7b_push.txt', `THERMAL:\n${thermal}\n\nBATTERY:\n${battery}\n\nMEMINFO:\n${meminfo}`, 'utf8');
console.log('Saved 7B model push and telemetry evidence.');

