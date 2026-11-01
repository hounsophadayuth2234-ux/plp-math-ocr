import fs from 'fs';
import path from 'path';

const fixturesDir = path.resolve('android-offline-spike/fixtures');

const expectedFixtures = [
  { path: 'dev/khmer_ocr_dev.jsonl', type: 'DEV' },
  { path: 'held-out/khmer_ocr_heldout.jsonl', type: 'HELD-OUT' },
  { path: 'dev/khmer_segmentation_cases.json', type: 'DEV' },
  { path: 'dev/mathcore_grade1_6_dev.json', type: 'DEV' },
  { path: 'held-out/mathcore_grade1_6_heldout.json', type: 'HELD-OUT' },
  { path: 'dev/sync_concurrency_traces.json', type: 'DEV' },
  { path: 'held-out/sync_heldout_reconciliation.json', type: 'HELD-OUT' }
];

console.log('=== PLP MATH OFFLINE FACTORY — FIXTURE VALIDATOR ===');
console.log('Scanning fixtures root:', fixturesDir);

let missingCount = 0;
let presentCount = 0;

for (const fix of expectedFixtures) {
  const fullPath = path.join(fixturesDir, fix.path);
  if (!fs.existsSync(fullPath)) {
    console.log(`[MISSING] [${fix.type}] ${fix.path}`);
    missingCount++;
  } else {
    const stat = fs.statSync(fullPath);
    console.log(`[FOUND] [${fix.type}] ${fix.path} (${stat.size} bytes)`);
    presentCount++;
  }
}

// Unit test against SYNTHETIC fixtures
console.log('\n--- Unit Testing Validator Against SYNTHETIC Fixtures (Rule B7) ---');
const syntheticDir = path.join(fixturesDir, 'synthetic');
const syntheticFiles = fs.readdirSync(syntheticDir).filter(f => f.endsWith('.json'));

for (const sf of syntheticFiles) {
  const sPath = path.join(syntheticDir, sf);
  const data = JSON.parse(fs.readFileSync(sPath, 'utf-8'));
  if (data.label !== 'SYNTHETIC') {
    console.error(`CRITICAL INVARIANT VIOLATION: ${sf} must be explicitly labeled SYNTHETIC`);
    process.exit(1);
  }
  console.log(`✓ Verified SYNTHETIC fixture integrity: ${sf} (${data.cases.length} test cases)`);
}

console.log('--------------------------------------------------');
console.log(`Fixture Status: ${presentCount} present, ${missingCount} missing.`);
if (missingCount > 0) {
  console.log('STATUS: PENDING ARCHITECT FIXTURE PACKS (Rule B7)');
} else {
  console.log('STATUS: ALL FIXTURE PACKS READY');
}

