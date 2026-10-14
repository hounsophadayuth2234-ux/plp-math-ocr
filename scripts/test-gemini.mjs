import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync(".env.local")) {
  const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
}
console.log("Testing with API Key prefix:", apiKey ? apiKey.substring(0, 8) + "..." : "none");

const genAI = new GoogleGenerativeAI(apiKey);
const testModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"];

async function testAll() {
  for (const m of testModels) {
    console.log(`\nTesting model: ${m}...`);
    const t0 = Date.now();
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent("hello, reply 'ok'");
      console.log(`✓ ${m} responded in ${Date.now() - t0} ms:`, res.response.text());
      break;
    } catch (e) {
      console.error(`✗ ${m} failed in ${Date.now() - t0} ms:`, e.message);
    }
  }
}

testAll();
