import fs from 'fs';

async function testProduction() {
  console.log('--- TEST 1: Image OCR on Production (math-quadratic.png) ---');
  const fileBytes = fs.readFileSync('math-quadratic.png');
  const blob = new Blob([fileBytes], { type: 'image/png' });
  const form1 = new FormData();
  form1.append('image', blob, 'math-quadratic.png');

  const t0 = Date.now();
  const res1 = await fetch('https://ai-toolkit-hub-nu.vercel.app/api/math-ocr', {
    method: 'POST',
    body: form1,
  });
  const elapsed1 = Date.now() - t0;
  console.log(`Status: ${res1.status} in ${elapsed1} ms`);
  const data1 = await res1.json();
  console.log('Data:', JSON.stringify(data1, null, 2));

  console.log('\n--- TEST 2: Vertical Arithmetic on Production ---');
  const form2 = new FormData();
  form2.append('rawText', '  347\n+ 285\n-----\n[___]');
  const t1 = Date.now();
  const res2 = await fetch('https://ai-toolkit-hub-nu.vercel.app/api/math-ocr', {
    method: 'POST',
    body: form2,
  });
  const elapsed2 = Date.now() - t1;
  console.log(`Status: ${res2.status} in ${elapsed2} ms`);
  const data2 = await res2.json();
  console.log('Data:', JSON.stringify(data2, null, 2));
}

testProduction().catch(console.error);
