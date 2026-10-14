import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync(".env.local")) {
  const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
}

const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_PROMPT = `You are a mathematical image transcription engine.

Your ONLY task is to copy the visible mathematical content from the uploaded image and convert the same content into three code formats:
1. LaTeX
2. Jodit-compatible HTML with strict inline CSS
3. Standard MathML

This is image-to-code transcription only, NOT problem solving.

STRICT RULES:
- Do NOT solve any equation or problem.
- Do NOT calculate any result or answer.
- Do NOT factor, simplify, rearrange, or transform the expression.
- Do NOT add steps, explanations, answers, roots, or conclusions.
- Do NOT change any number, variable, operator, sign, exponent, fraction, root, bracket, or equality/inequality symbol.
- Preserve the exact visual meaning and structure of the image.
- Preserve line breaks, alignment, vertical arithmetic, fractions, superscripts, subscripts, matrices, and geometric labels.
- Do NOT replace a visible symbol with another symbol.
- Do NOT guess unclear content. Mark unclear content in "uncertainParts".
- The three outputs must represent exactly the same transcription.

CRITICAL JODIT HTML FORMATTING RULES:
1. ABSOLUTE STRICT INLINE CSS ONLY:
   - NO <style> tags, NO CSS classes, NO external stylesheets.
   - EVERY single element MUST use inline style="..." attributes.
2. WRAPPER:
   - Wrap in: <div style="font-family: 'Times New Roman', serif; font-size: 24px; line-height: 1.8; color: #000;">
3. VERTICAL ARITHMETIC:
   - Never output calculated answers. If the bottom line has a blank or [___], output literal text [___].
   - Table structure: <table style="border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 28px; border: none; margin: 10px auto; text-align: right;">
   - Fixed-width columns for place values: <td style="border: none; width: 40px; padding: 4px;">...</td>
   - Answer line separator: style="border-top: 2px solid black;"
4. FRACTIONS:
   - Vertical flex: <span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 5px;">
   - Numerator must have: style="border-bottom: 2px solid black;"

Return a valid JSON object with EXACTLY this structure:
{
  "transcription": "literal raw text of the transcription",
  "detectedType": "short descriptive type (e.g., Quadratic Equation, Vertical Addition, Fraction)",
  "rawDescription": "brief description of the transcribed mathematical content (without solving)",
  "latex": "valid, compilable LaTeX code representing the exact expression",
  "joditHtml": "Jodit HTML with strict inline CSS only",
  "mathml": "valid W3C MathML markup representing the exact expression",
  "confidence": 1.0,
  "uncertainParts": []
}`;

async function testVertical() {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });

  const res = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: "Transcribe the following vertical arithmetic:   347\n+ 285\n-----\n[___]" }
  ]);

  console.log(res.response.text());
}

testVertical().catch(console.error);
