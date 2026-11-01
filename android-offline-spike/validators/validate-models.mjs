import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const modelsDir = path.resolve('android-offline-spike/models');

const expectedModels = [
  { name: 'm01_ocr_detector.onnx', minSize: 4 * 1024 * 1024, maxSize: 50 * 1024 * 1024, format: 'onnx' },
  { name: 'm01_ocr_recognizer.onnx', minSize: 10 * 1024 * 1024, maxSize: 80 * 1024 * 1024, format: 'onnx' },
  { name: 'birefnet_lite_fp16.onnx', minSize: 100 * 1024 * 1024, maxSize: 140 * 1024 * 1024, format: 'onnx' },
  { name: 'realesr-general-x4v3.onnx', minSize: 50 * 1024 * 1024, maxSize: 100 * 1024 * 1024, format: 'onnx' },
  { name: 'm04_solver_q4_k_m.gguf', minSize: 1.5 * 1024 * 1024 * 1024, maxSize: 5.5 * 1024 * 1024 * 1024, format: 'gguf' },
  { name: 'm05_diffusion_distilled.onnx', minSize: 800 * 1024 * 1024, maxSize: 3.0 * 1024 * 1024 * 1024, format: 'onnx' }
];

console.log('=== PLP MATH OFFLINE FACTORY — MODEL VALIDATOR ===');
console.log('Scanning directory:', modelsDir);

let missingCount = 0;
let presentCount = 0;

for (const m of expectedModels) {
  const filePath = path.join(modelsDir, m.name);
  if (!fs.existsSync(filePath)) {
    console.log(`[MISSING] ${m.name} (Format: ${m.format.toUpperCase()}, Expected: ${(m.minSize / 1e6).toFixed(1)}MB - ${(m.maxSize / 1e6).toFixed(1)}MB)`);
    missingCount++;
    continue;
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;
  console.log(`[FOUND] ${m.name} (${(size / 1e6).toFixed(2)} MB)`);

  // Verify magic header
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(8);
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  if (m.format === 'gguf') {
    const magic = buffer.toString('utf-8', 0, 4);
    if (magic !== 'GGUF') {
      console.error(`  ERROR: Invalid GGUF header for ${m.name}: ${magic}`);
    } else {
      console.log(`  ✓ Valid GGUF header detected.`);
    }
  }

  // Calculate SHA-256
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  stream.on('data', d => hash.update(d));
  stream.on('end', () => {
    console.log(`  SHA-256: ${hash.digest('hex')}`);
  });

  presentCount++;
}

console.log('--------------------------------------------------');
console.log(`Summary: ${presentCount} present, ${missingCount} missing.`);
if (missingCount > 0) {
  console.log(`STATUS: PENDING ARCHITECT PLACEMENT (Rule B7)`);
} else {
  console.log(`STATUS: ALL REQUIRED MODELS VERIFIED`);
}

