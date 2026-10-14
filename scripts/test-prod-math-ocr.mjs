import fs from 'fs';

async function testProd() {
  console.log("Sending POST to https://ai-toolkit-hub-nu.vercel.app/api/math-ocr...");
  const t0 = Date.now();
  
  const form = new FormData();
  form.append("rawText", "x^2 + 5x + 6 = 0");

  try {
    const res = await fetch("https://ai-toolkit-hub-nu.vercel.app/api/math-ocr", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(65000)
    });
    console.log(`Status: ${res.status} ${res.statusText} (${Date.now() - t0} ms)`);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Error after ${Date.now() - t0} ms:`, e);
  }
}

testProd();
