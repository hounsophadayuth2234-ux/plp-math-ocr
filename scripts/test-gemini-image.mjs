import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync(".env.local")) {
  const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
}

const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_INSTRUCTION = `You are a mathematical image transcription engine.

Your only task is to copy the visible mathematical content from the uploaded image and convert that same content into LaTeX, Jodit-compatible HTML with strict inline CSS, and standard MathML.

Do not solve the problem.
Do not calculate.
Do not factor.
Do not simplify.
Do not rearrange.
Do not add steps, answers, roots, explanations, or conclusions.
Preserve every visible number, variable, operator, sign, exponent, fraction, root, bracket, equality sign, inequality sign, line break, alignment, matrix, and label.
Do not guess unclear symbols. Mark them in uncertainParts.
All three outputs must represent exactly the same visible transcription.

Return strict JSON in this format:
{
  "transcription": "...",
  "latex": "...",
  "joditHtml": "...",
  "mathml": "...",
  "confidence": 1.0,
  "uncertainParts": []
}`;

async function testOcr() {
  const imgBuffer = fs.readFileSync("math-quadratic.png");
  const base64Data = imgBuffer.toString("base64");

  const candidateModels = [
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash",
  ];
  for (const modelName of candidateModels) {
    console.log(`Trying ${modelName}...`);
    const t0 = Date.now();
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
      });
      const res = await model.generateContent([
        { text: SYSTEM_INSTRUCTION },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Data
          }
        }
      ]);
      console.log(`✓ Response in ${Date.now() - t0} ms:`);
      console.log(res.response.text());
      return;
    } catch (e) {
      console.error(`✗ ${modelName} failed in ${Date.now() - t0} ms:`, e.message);
    }
  }
}

testOcr();
