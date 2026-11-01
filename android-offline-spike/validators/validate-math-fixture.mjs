import fs from 'fs';
import path from 'path';

const filePath = path.resolve('android-offline-spike/fixtures/math_test_khmer.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('=== MATH TEST KHMER FIXTURE VALIDATION ===');
console.log('Path:', filePath);
console.log('Item count:', data.length);

let valid = true;
data.forEach((item, index) => {
  console.log(`\n[Item ${index + 1}] ID: ${item.id} | Type: ${item.type}`);
  console.log('Question (KM):', item.question_km);
  console.log('Variables:', JSON.stringify(item.expected_variables));
  console.log('Expected Answer:', item.expected_answer, `(${typeof item.expected_answer})`);
  console.log('Unit (KM):', item.unit_km);

  if (typeof item.id !== 'string') { console.error('Error: id must be string'); valid = false; }
  if (typeof item.type !== 'string') { console.error('Error: type must be string'); valid = false; }
  if (typeof item.question_km !== 'string') { console.error('Error: question_km must be string'); valid = false; }
  if (typeof item.expected_variables !== 'object' || item.expected_variables === null) { console.error('Error: expected_variables must be object'); valid = false; }
  if (typeof item.expected_answer !== 'number') { console.error('Error: expected_answer must be number'); valid = false; }
  if (typeof item.unit_km !== 'string') { console.error('Error: unit_km must be string'); valid = false; }

  for (const [k, v] of Object.entries(item.expected_variables)) {
    if (typeof v !== 'number') { console.error(`Error: expected_variables.${k} must be number`); valid = false; }
  }
});

console.log('\n----------------------------------------');
console.log('Schema Validity:', valid ? 'PASSED (100% compliant)' : 'FAILED');
if (!valid) process.exit(1);

