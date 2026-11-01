import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const adb = path.resolve('android-offline-spike/platform-tools/adb.exe');
const modelsDir = path.resolve('android-offline-spike/models');

console.log('=== PUSH MODELS TO ONEPLUS PAD 3 VIA ADB ===');

const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.onnx') || f.endsWith('.gguf'));

if (files.length === 0) {
  console.log('No model files found in android-offline-spike/models/ to push.');
  console.log('Awaiting architect placement.');
  process.exit(0);
}

// Ensure remote directory exists
execSync(`"${adb}" shell mkdir -p /data/local/tmp/models/`);

for (const file of files) {
  const localPath = path.join(modelsDir, file);
  console.log(`Pushing ${file} to /data/local/tmp/models/...`);
  execSync(`"${adb}" push "${localPath}" /data/local/tmp/models/`);
  console.log(`Verifying remote checksum for ${file}...`);
  const remoteSha = execSync(`"${adb}" shell sha256sum /data/local/tmp/models/${file}`, { encoding: 'utf-8' });
  console.log(`Remote: ${remoteSha.trim()}`);
}

console.log('All available models synchronized to tablet!');

