import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------
export interface MathOcrResponse {
  latex: string;
  joditHtml: string;
  mathml: string;
  detectedType: string;
  rawDescription: string;
  isDemoMode?: boolean;
}

export interface MathOcrError {
  error: string;
  details?: string;
}

// -----------------------------------------------------------
// High-fidelity fallback / demo generator (LaTeX, Jodit HTML & MathML)
// -----------------------------------------------------------
function generateDemoResponse(promptOrDesc: string): MathOcrResponse {
  const text = promptOrDesc.toLowerCase();

  if (text.includes("triangle") || text.includes("geometry") || text.includes("polygon")) {
    return {
      detectedType: "Geometric Right Triangle",
      rawDescription: "A beautiful right-angled triangle showing the Pythagorean theorem in action! The legs are 3 and 4, and the longest side (hypotenuse) is 5.",
      latex: "\\[ a = 3,\\, b = 4,\\, c = \\sqrt{a^2 + b^2} = \\sqrt{3^2 + 4^2} = 5 \\]",
      joditHtml: `<div style="font-family: 'Times New Roman', serif; font-size: 24px; line-height: 1.8; color: #000; text-align: center;">
  <strong>Pythagorean Theorem</strong>
  <br/>
  <svg width="240" height="180" viewBox="0 0 240 180" style="display: block; margin: 20px auto;">
    <!-- Triangle -->
    <polygon points="40,140 200,140 40,40" style="fill:#e0e7ff; stroke:#4338ca; stroke-width:3; stroke-linejoin:round;" />
    <!-- Right angle square -->
    <rect x="40" y="120" width="20" height="20" style="fill:none; stroke:#4338ca; stroke-width:2;" />
    <!-- Bold Text Labels -->
    <text x="20" y="95" style="font-family:'Times New Roman',serif; font-size:24px; font-weight:bold; fill:#000;">3</text>
    <text x="115" y="165" style="font-family:'Times New Roman',serif; font-size:24px; font-weight:bold; fill:#000;">4</text>
    <text x="135" y="80" style="font-family:'Times New Roman',serif; font-size:24px; font-weight:bold; fill:#dc2626;">5</text>
  </svg>
</div>`,
      mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mrow>
    <mi>a</mi>
    <mo>=</mo>
    <mn>3</mn>
    <mo>,</mo>
    <mspace width="0.5em"/>
    <mi>b</mi>
    <mo>=</mo>
    <mn>4</mn>
    <mo>,</mo>
    <mspace width="0.5em"/>
    <mi>c</mi>
    <mo>=</mo>
    <msqrt>
      <mrow>
        <msup><mi>a</mi><mn>2</mn></msup>
        <mo>+</mo>
        <msup><mi>b</mi><mn>2</mn></msup>
      </mrow>
    </msqrt>
    <mo>=</mo>
    <mn>5</mn>
  </mrow>
</math>`,
      isDemoMode: true,
    };
  }

  if (text.includes("fraction") || text.includes("x²") || text.includes("equation") || text.includes("algebra")) {
    return {
      detectedType: "Algebraic Equation",
      rawDescription: "Let's solve the quadratic equation using the famous quadratic formula!",
      latex: "\\[ x = \\frac{-5 \\pm \\sqrt{5^2 - 4(3)(-2)}}{2(3)} \\]",
      joditHtml: `<div style="font-family: 'Times New Roman', serif; font-size: 24px; line-height: 1.8; color: #000; text-align: center;">
  <strong>Solve for x:</strong><br/><br/>
  x = 
  <span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 5px;">
    <span style="border-bottom: 2px solid black; padding: 0 8px;">&minus;5 &plusmn; &radic;(25 &minus; (&minus;24))</span>
    <span style="padding: 0 8px;">6</span>
  </span>
  <br/>
  x = 
  <span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 5px;">
    <span style="border-bottom: 2px solid black; padding: 0 8px;">&minus;5 &plusmn; 7</span>
    <span style="padding: 0 8px;">6</span>
  </span>
</div>`,
      mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mrow>
    <mi>x</mi>
    <mo>=</mo>
    <mfrac>
      <mrow>
        <mo>&minus;</mo>
        <mn>5</mn>
        <mo>&plusmn;</mo>
        <msqrt>
          <mrow>
            <msup><mn>5</mn><mn>2</mn></msup>
            <mo>&minus;</mo>
            <mn>4</mn>
            <mo>&times;</mo>
            <mn>3</mn>
            <mo>&times;</mo>
            <mo>(</mo><mo>&minus;</mo><mn>2</mn><mo>)</mo>
          </mrow>
        </msqrt>
      </mrow>
      <mrow>
        <mn>2</mn>
        <mo>&times;</mo>
        <mn>3</mn>
      </mrow>
    </mfrac>
  </mrow>
</math>`,
      isDemoMode: true,
    };
  }

  // Default: vertical addition
  return {
    detectedType: "Vertical Arithmetic Addition",
    rawDescription: "Let's practice adding large numbers together in columns!",
    latex: "\\[ \\begin{array}{r@{\\quad}r} & 347 \\\\ + & 285 \\\\ \\hline & 632 \\end{array} \\]",
    joditHtml: `<div style="font-family: 'Times New Roman', serif; font-size: 24px; line-height: 1.8; color: #000;">
  <table style="border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 28px; border: none; margin: 10px auto; text-align: right;">
    <tbody>
      <tr>
        <td style="border: none; width: 40px; padding: 4px;"></td>
        <td style="border: none; width: 40px; padding: 4px;">3</td>
        <td style="border: none; width: 40px; padding: 4px;">4</td>
        <td style="border: none; width: 40px; padding: 4px;">7</td>
      </tr>
      <tr>
        <td style="border: none; width: 40px; padding: 4px; text-align: center;">+</td>
        <td style="border: none; width: 40px; padding: 4px;">2</td>
        <td style="border: none; width: 40px; padding: 4px;">8</td>
        <td style="border: none; width: 40px; padding: 4px;">5</td>
      </tr>
      <tr>
        <td style="border: none; width: 40px; border-top: 2px solid black; padding: 4px;"></td>
        <td colspan="3" style="border: none; border-top: 2px solid black; padding: 4px; text-align: right;">
          [___]
        </td>
      </tr>
    </tbody>
  </table>
</div>`,
    mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mtable columnalign="right">
    <mtr>
      <mtd><mspace width="1em"/></mtd>
      <mtd><mn>3</mn></mtd>
      <mtd><mn>4</mn></mtd>
      <mtd><mn>7</mn></mtd>
    </mtr>
    <mtr>
      <mtd><mo>+</mo></mtd>
      <mtd><mn>2</mn></mtd>
      <mtd><mn>8</mn></mtd>
      <mtd><mn>5</mn></mtd>
    </mtr>
    <mtr style="border-top: 2px solid #000">
      <mtd><mspace width="1em"/></mtd>
      <mtd><mn>6</mn></mtd>
      <mtd><mn>3</mn></mtd>
      <mtd><mn>2</mn></mtd>
    </mtr>
  </mtable>
</math>`,
    isDemoMode: true,
  };
}

// -----------------------------------------------------------
// Gemini prompt engineering: demands LaTeX, Jodit HTML & MathML
// -----------------------------------------------------------
const SYSTEM_PROMPT = `You are an Expert Primary Education Content Developer, mathematical typesetting engine, and HTML code generator.
Your goal is to produce content for a Primary Education platform (PLP) that is visually stunning, highly legible for young students, and 100% compatible with the Jodit WYSIWYG Editor.

Analyze the provided math problem (from an image or text) and return a JSON response with EXACTLY these five keys:

1. "detectedType": A short description of what was detected (e.g., "Vertical Addition", "Algebraic Equation", "Geometric Figure").
2. "rawDescription": A plain-English, kid-friendly explanation of the math problem.
3. "latex": Valid, compilable LaTeX code representing the full mathematical expression.
4. "mathml": Valid, standard MathML markup (W3C) representing the expression.
5. "joditHtml": HTML code combined with ABSOLUTE STRICT INLINE CSS ONLY.

CRITICAL PLP RULES for "joditHtml" (Must be followed exactly):

1. ABSOLUTE STRICT INLINE CSS ONLY:
   - NO <style> tags, NO classes, NO external stylesheets.
   - EVERY single styling property MUST be inline via the style="..." attribute.

2. KID-FRIENDLY TYPOGRAPHY (Final Wrapper):
   - Wrap the ENTIRE output in a container with this exact style:
     <div style="font-family: 'Times New Roman', serif; font-size: 24px; line-height: 1.8; color: #000;">

3. FLAWLESS VERTICAL ARITHMETIC & PLACE-VALUE ALIGNMENT:
   - DO NOT SOLVE THE MATH: You are an OCR transcriber, not a calculator. If the image has a blank space or '[___]' at the bottom, YOU MUST OUTPUT EXACTLY '[___]'. Do NOT output the calculated answer (e.g., never output 25 for 70 - 45).
   - MULTI-COLUMN FIXED-WIDTH LAYOUT: Every single digit must have its own dedicated <td> column with a fixed width (e.g., width: 40px) to guarantee absolute vertical place-value alignment (tens under tens, units under units). You must dynamically generate the correct number of columns based on the digits in the image.
   - ZERO BORDERS: Absolutely NO outer or inner table borders are allowed, except the 'border-top: 2px solid black' for the result line. The <table style="..."> and all <td style="..."> elements MUST explicitly contain 'border: none;'.
   - EXACT HTML TEMPLATE TO USE:
     <table style="border-collapse: collapse; font-family: 'Times New Roman', serif; font-size: 28px; border: none; margin: 10px auto; text-align: right;">
       <!-- First Number Row (e.g., 70) -->
       <tr>
         <td style="border: none; width: 40px; padding: 4px;"></td>
         <td style="border: none; width: 40px; padding: 4px;">7</td>
         <td style="border: none; width: 40px; padding: 4px;">0</td>
       </tr>
       <!-- Operator and Second Number Row (e.g., - 45) -->
       <tr>
         <td style="border: none; width: 40px; padding: 4px; text-align: center;">-</td>
         <td style="border: none; width: 40px; padding: 4px;">4</td>
         <td style="border: none; width: 40px; padding: 4px;">5</td>
       </tr>
       <!-- Result Row with Border Top and [___] -->
       <tr>
         <td style="border: none; width: 40px; border-top: 2px solid black; padding: 4px;"></td>
         <td colspan="2" style="border: none; border-top: 2px solid black; padding: 4px; text-align: right;">
           [___]
         </td>
       </tr>
     </table>
   - NEVER replace [___] with an <input> tag. Keep it exactly as the literal text [___] so the PLP platform can parse it.

4. FRACTIONS:
   - Render fractions using a vertical flex layout using this exact styling:
     <span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; margin: 0 5px;">
   - The numerator MUST have: style="border-bottom: 2px solid black;"

5. CREATIVE GEOMETRY (SVG):
   - If drawing shapes, output precise, fully self-contained inline <svg> code.
   - Use bold primary/secondary colors.
   - Use clear, thick strokes (e.g., stroke-width="3").
   - Use large, highly legible text labels (e.g., font-size="24").
   - Ensure the SVG has proper width, height, and viewBox attributes.

RESPOND WITH ONLY A RAW JSON OBJECT. Do not wrap in markdown code fences.`;

// -----------------------------------------------------------
// Route Handler
// -----------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawText = formData.get("rawText") as string | null;
    const imageFile = formData.get("image") as File | null;
    const customInstructions = formData.get("customInstructions") as string | null;

    if (!rawText && !imageFile) {
      return NextResponse.json<MathOcrError>(
        { error: "Please provide either an image or raw text input." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // If API key is not configured, automatically switch to high-fidelity demo mode!
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      const demoResult = generateDemoResponse(rawText || imageFile?.name || "347 + 285");
      return NextResponse.json<MathOcrResponse>(demoResult, { status: 200 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-pro-latest", "gemini-3.8-flash"];

    const parts: Part[] = [{ text: SYSTEM_PROMPT }];

    if (imageFile) {
      const imageBytes = await imageFile.arrayBuffer();
      const base64Image = Buffer.from(imageBytes).toString("base64");
      parts.push({
        inlineData: {
          mimeType: imageFile.type as "image/png" | "image/jpeg" | "image/webp",
          data: base64Image,
        },
      });
      parts.push({
        text: rawText
          ? `Also consider this additional text context: ${rawText}`
          : "Analyze this math image carefully.",
      });
    } else if (rawText) {
      parts.push({
        text: `Analyze and typeset the following math problem into LaTeX, Jodit HTML, and MathML: ${rawText}`,
      });
    }

    if (customInstructions && customInstructions.trim()) {
      parts.push({
        text: `\n\nCRITICAL USER REFINEMENT INSTRUCTIONS:\n${customInstructions.trim()}\nPlease apply these instructions to adjust your output.`,
      });
    }

    try {
      let responseText = "";
      let lastErr: unknown = null;

      // Try candidate models in order of speed and availability
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({ contents: [{ role: "user", parts }] });
          responseText = result.response.text().trim();
          if (responseText) break;
        } catch (mErr) {
          lastErr = mErr;
          console.warn(`[math-ocr] Model ${modelName} failed, trying next:`, mErr);
        }
      }

      if (!responseText) {
        throw (lastErr || new Error("All Gemini models returned empty response"));
      }

      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed: MathOcrResponse = JSON.parse(cleaned);

      if (!parsed.latex || !parsed.joditHtml) {
        throw new Error("Missing required fields in model response");
      }

      // If model omitted mathml, synthesize a fallback wrapper
      if (!parsed.mathml) {
        parsed.mathml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtext>${parsed.rawDescription || "Math Expression"}</mtext></math>`;
      }

      return NextResponse.json<MathOcrResponse>(parsed, { status: 200 });
    } catch (genError) {
      console.warn("[/api/math-ocr] Gemini API failed, switching to demo mode:", genError);
      const demoResult = generateDemoResponse(rawText || imageFile?.name || "vertical addition");
      return NextResponse.json<MathOcrResponse>(demoResult, { status: 200 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error("[/api/math-ocr] Error:", err);
    return NextResponse.json<MathOcrError>(
      { error: "Internal server error.", details: message },
      { status: 500 }
    );
  }
}
