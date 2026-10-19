import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync(".env.local")) {
  const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
}

const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_PROMPT = `You are a mathematical and educational document transcription engine specializing in bilingual Khmer-language and mathematical notation.

Your ONLY task is to faithfully transcribe ALL visible content (both Khmer natural language text and mathematical notation) from the image and convert it into three standard formats:
1. LaTeX
2. Jodit-compatible HTML with strict inline CSS
3. Standard MathML

CRITICAL INSTRUCTIONS:
- Transcribe BOTH Khmer educational text (such as titles, problem numbers like "លំហាត់ទី១", prompts like "ចូរគណនា", instructions, notes) AND mathematical equations/expressions.
- Do NOT solve the problem. Do NOT calculate. Do NOT add answers or explanations.
- Preserve every visible symbol, word, operator, and number.
- In LaTeX:
  * Mathematical equations should be in standard LaTeX.
  * Khmer text MUST be wrapped in \\text{...} (e.g. \\text{លំហាត់ទី១៖ ចូរគណនា} \\quad 2 + 3 = 5) so KaTeX renders it cleanly via Unicode fonts.
  * Blanks or underscores must escape underscores (\\_\\_\\_).
- In Jodit HTML:
  * Wrap in <div style="font-family: 'Kantumruy Pro', 'Khmer OS Battambang', 'Times New Roman', serif; font-size: 22px; line-height: 1.8; color: #000;">
  * Preserve Khmer text in styled <span> or <p>.
  * Format math with strict inline CSS.
- In MathML:
  * Wrap in <math xmlns="http://www.w3.org/1998/Math/MathML" display="block">...</math>.
  * Wrap Khmer words in <mtext>...</mtext>.
- Return strict JSON:
{
  "transcription": "literal raw transcription of Khmer and math text with NFC normalization",
  "detectedType": "Bilingual Khmer Math Problem",
  "rawDescription": "brief description of content",
  "latex": "valid compilable LaTeX code with \\text{...} for Khmer",
  "joditHtml": "clean Jodit HTML with inline CSS",
  "mathml": "valid MathML with <mtext> for Khmer",
  "confidence": 0.98,
  "uncertainParts": []
}`;

async function runTest() {
  const imgBuffer = fs.readFileSync("test/fixtures/khmer-math-test.png");
  const base64Data = imgBuffer.toString("base64");

  const models = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.8-flash"];
  for (const m of models) {
    console.log(`\n--- Testing ${m} on image-only input ---`);
    const t0 = performance.now();
    try {
      const model = genAI.getGenerativeModel({
        model: m,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const res = await model.generateContent([
        { text: SYSTEM_PROMPT },
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        },
        {
          text: "Transcribe all visible Khmer text and mathematical formulas from this image without solving.",
        },
      ]);

      const elapsed = Math.round(performance.now() - t0);
      const text = res.response.text();
      console.log(`Success in ${elapsed}ms:`);
      console.log(text);
      const parsed = JSON.parse(text);
      console.log("Parsed Transcription:", parsed.transcription);
      console.log("Parsed LaTeX:", parsed.latex);
      console.log("Uncertain parts:", parsed.uncertainParts);
      break; // Found fast working model
    } catch (e) {
      console.error(`Failed on ${m} in ${Math.round(performance.now() - t0)}ms:`, e.message);
    }
  }
}

runTest();
