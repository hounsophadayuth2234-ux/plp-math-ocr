import fs from 'fs';

async function testLocalApi() {
  const fileBytes = fs.readFileSync('math-quadratic.png');
  const blob = new Blob([fileBytes], { type: 'image/png' });
  const form = new FormData();
  form.append('image', blob, 'math-quadratic.png');

  console.log('Testing route with image math-quadratic.png (x² + 5x + 6 = 0)...');
  const t0 = Date.now();
  
  // Test local server
  const res = await fetch('http://localhost:3005/api/math-ocr', {
    method: 'POST',
    body: form,
  });
  
  console.log(`HTTP ${res.status} in ${Date.now() - t0} ms`);
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

testLocalApi().catch(console.error);
