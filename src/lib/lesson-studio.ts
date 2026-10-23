import { normalizeKhmerEducationalText } from "./khmer-text-normalizer";


export type LessonStudioMode = "visual_svg" | "quiz_generator" | "html_styler";
export type GradeLevel =
  | "auto"
  | "grade_1"
  | "grade_2"
  | "grade_3"
  | "grade_4"
  | "grade_5"
  | "grade_6";

export interface VisualSvgResult {
  svg: string;
  htmlCard: string;
  titleKhmer: string;
  descriptionKhmer: string;
  diagramType: string;
  gradeLevel: string;
}

export interface QuizQuestion {
  id: number;
  type: "multiple_choice" | "fill_in_the_blank" | "word_problem";
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface QuizResult {
  titleKhmer: string;
  gradeLevel: string;
  gradeTitleKhmer: string;
  textContent: string;
  htmlContent: string;
  questions: QuizQuestion[];
}

export interface HtmlBox {
  type: "definition" | "example" | "note" | "summary";
  titleKhmer: string;
  contentHtml: string;
}

export interface HtmlStylerResult {
  titleKhmer: string;
  correctedText: string;
  htmlContent: string;
  boxes: HtmlBox[];
  notes: string[];
}

export interface LessonStudioResponse {
  ok: boolean;
  mode: LessonStudioMode;
  visual?: VisualSvgResult;
  quiz?: QuizResult;
  styler?: HtmlStylerResult;
  error?: string;
  errorKhmer?: string;
  requestId?: string;
  model?: string;
  durationMs?: number;
}

export const GRADE_LABELS_KHMER: Record<GradeLevel, string> = {
  auto: "ស្វ័យប្រវត្តិ (Auto-Detect)",
  grade_1: "ថ្នាក់ទី ១ (Grade 1)",
  grade_2: "ថ្នាក់ទី ២ (Grade 2)",
  grade_3: "ថ្នាក់ទី ៣ (Grade 3)",
  grade_4: "ថ្នាក់ទី ៤ (Grade 4)",
  grade_5: "ថ្នាក់ទី ៥ (Grade 5)",
  grade_6: "ថ្នាក់ទី ៦ (Grade 6)",
};

/**
 * Sanitize and enforce well-formed SVG with child-friendly attributes.
 */
export function sanitizeAndEnforceSvg(rawSvg: string): string {
  if (!rawSvg || typeof rawSvg !== "string") {
    return createDefaultCountingSvg(5, 3);
  }

  // Extract <svg>...</svg>
  const match = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
  let cleaned = match ? match[0] : rawSvg.trim();

  if (!cleaned.toLowerCase().startsWith("<svg")) {
    cleaned = `<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg">\n${cleaned}\n</svg>`;
  }

  // Strip dangerous elements and attributes
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/on\w+="[^"]*"/gi, "");
  cleaned = cleaned.replace(/on\w+='[^']*'/gi, "");
  cleaned = cleaned.replace(/javascript:[^"']*/gi, "");
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  // Ensure standard viewBox
  if (!cleaned.includes("viewBox")) {
    cleaned = cleaned.replace("<svg", '<svg viewBox="0 0 600 320"');
  }
  if (!cleaned.includes("xmlns")) {
    cleaned = cleaned.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // Inject responsive attributes and Khmer font family
  cleaned = cleaned.replace(
    /<svg([^>]*)>/i,
    `<svg$1 width="100%" height="auto" style="max-width: 100%; display: block; margin: 0 auto; font-family: 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif;">`
  );

  return cleaned;
}

/**
 * Wrap SVG into a child-friendly pedagogical HTML card for Jodit / Web / Word.
 */
export function wrapSvgInHtmlCard(
  svgContent: string,
  titleKhmer: string,
  captionKhmer?: string
): string {
  const sanitized = sanitizeAndEnforceSvg(svgContent);
  const captionHtml = captionKhmer
    ? `<div class="svg-caption" style="margin-top: 14px; font-size: 14px; color: #475569; font-weight: 600; line-height: 1.6;">${escapeHtml(
        captionKhmer
      )}</div>`
    : "";

  return `<div class="lesson-svg-container" style="margin: 20px auto; max-width: 640px; background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 20px 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); text-align: center; font-family: 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif;">
  <div class="svg-title" style="color: #1e3a8a; font-size: 16px; font-weight: 800; margin-bottom: 16px;">
    ${escapeHtml(titleKhmer || "រូបភាពគណិតវិទ្យា (Math Visual Diagram)")}
  </div>
  <div class="svg-viewport" style="background: #f8fafc; border-radius: 12px; padding: 12px; border: 1px dashed #cbd5e1; display: flex; justify-content: center; align-items: center; overflow: hidden;">
    ${sanitized}
  </div>
  ${captionHtml}
</div>`;
}

/**
 * Create a crisp default counting SVG diagram (apples: group A + group B).
 */
export function createDefaultCountingSvg(countA: number = 5, countB: number = 3): string {
  const total = countA + countB;
  let circlesA = "";
  for (let i = 0; i < countA; i++) {
    const cx = 60 + i * 40;
    circlesA += `
      <g transform="translate(${cx}, 140)">
        <circle cx="0" cy="0" r="16" fill="#ef4444" stroke="#dc2626" stroke-width="2" />
        <path d="M-2,-16 Q0,-22 4,-20 Q0,-16 0,-14" stroke="#15803d" stroke-width="3" fill="none" stroke-linecap="round" />
        <text x="0" y="5" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${i + 1}</text>
      </g>`;
  }

  let circlesB = "";
  for (let i = 0; i < countB; i++) {
    const cx = 350 + i * 40;
    circlesB += `
      <g transform="translate(${cx}, 140)">
        <circle cx="0" cy="0" r="16" fill="#10b981" stroke="#059669" stroke-width="2" />
        <path d="M-2,-16 Q0,-22 4,-20 Q0,-16 0,-14" stroke="#15803d" stroke-width="3" fill="none" stroke-linecap="round" />
        <text x="0" y="5" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle">${i + 1}</text>
      </g>`;
  }

  return `<svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg" width="100%" height="auto">
  <rect width="600" height="300" rx="16" fill="#f8fafc" />
  <text x="300" y="45" font-size="18" font-weight="800" fill="#1e3a8a" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
    ការរាប់ផ្លែឈើ និងប្រមាណវិធីបូក
  </text>
  
  <!-- Group A -->
  <rect x="30" y="80" width="${countA * 40 + 40}" height="120" rx="12" fill="#fee2e2" stroke="#fca5a5" stroke-dasharray="4 4" />
  <text x="${50 + (countA * 40) / 2}" y="105" font-size="13" font-weight="700" fill="#991b1b" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
    ផ្លែប៉ោមក្រហម ${countA}
  </text>
  ${circlesA}
  
  <!-- Operator + -->
  <text x="290" y="150" font-size="28" font-weight="800" fill="#2563eb" text-anchor="middle">+</text>
  
  <!-- Group B -->
  <rect x="320" y="80" width="${countB * 40 + 40}" height="120" rx="12" fill="#d1fae5" stroke="#6ee7b7" stroke-dasharray="4 4" />
  <text x="${340 + (countB * 40) / 2}" y="105" font-size="13" font-weight="700" fill="#065f46" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
    ផ្លែប៉ោមបៃតង ${countB}
  </text>
  ${circlesB}
  
  <!-- Bottom Total -->
  <text x="300" y="255" font-size="18" font-weight="800" fill="#1e293b" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
    ${countA} + ${countB} = <tspan fill="#ef4444">${total}</tspan> (សរុបមាន ${total} ផ្លែ)
  </text>
</svg>`;
}

/**
 * Create a default fraction SVG diagram (e.g. 3/4 circle and fraction bar).
 */
export function createDefaultFractionSvg(num: number = 3, den: number = 4): string {
  const fractionStr = `${num}/${den}`;
  return `<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" width="100%" height="auto">
  <rect width="600" height="320" rx="16" fill="#f0f9ff" />
  <text x="300" y="45" font-size="18" font-weight="800" fill="#0369a1" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
    រូបភាពបង្ហាញប្រភាគ ${fractionStr}
  </text>

  <!-- Circle Representation -->
  <g transform="translate(160, 160)">
    <circle cx="0" cy="0" r="70" fill="#e0f2fe" stroke="#0284c7" stroke-width="3" />
    <!-- 4 Slices -->
    <path d="M0,0 L0,-70 A70,70 0 0,1 70,0 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="2" />
    <path d="M0,0 L70,0 A70,70 0 0,1 0,70 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="2" />
    <path d="M0,0 L0,70 A70,70 0 0,1 -70,0 Z" fill="#38bdf8" stroke="#0284c7" stroke-width="2" />
    <path d="M0,0 L-70,0 A70,70 0 0,1 0,-70 Z" fill="#ffffff" stroke="#0284c7" stroke-width="2" />
    <text x="0" y="105" font-size="13" font-weight="700" fill="#0369a1" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
      រង្វង់បែងចែកជា ៤ (ផាត់ពណ៌ ៣)
    </text>
  </g>

  <!-- Fraction Bar Representation -->
  <g transform="translate(360, 110)">
    <rect x="0" y="0" width="180" height="40" rx="6" fill="#e0f2fe" stroke="#0284c7" stroke-width="2" />
    <rect x="0" y="0" width="45" height="40" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" />
    <rect x="45" y="0" width="45" height="40" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" />
    <rect x="90" y="0" width="45" height="40" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" />
    <rect x="135" y="0" width="45" height="40" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" />
    <text x="90" y="70" font-size="13" font-weight="700" fill="#0369a1" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
      របារប្រភាគ (៣ ភាគ ៤)
    </text>
  </g>

  <!-- Bottom Conclusion -->
  <text x="300" y="280" font-size="16" font-weight="800" fill="#0c4a6e" text-anchor="middle" font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif">
    ប្រភាគ ${fractionStr} មានភាគយកស្មើ ៣ និងភាគបែងស្មើ ៤
  </text>
</svg>`;
}

/**
 * Format Jodit-compatible HTML Box according to MoEYS standards.
 */
export function renderHtmlBox(box: HtmlBox): string {
  const { type, titleKhmer, contentHtml } = box;

  let bg = "#f0fdf4";
  let borderLeft = "#16a34a";
  let badgeBg = "#dcfce7";
  let badgeColor = "#15803d";
  let defaultTitle = "និយមន័យ (Definition)";

  if (type === "example") {
    bg = "#eff6ff";
    borderLeft = "#2563eb";
    badgeBg = "#dbeafe";
    badgeColor = "#1d4ed8";
    defaultTitle = "ឧទាហរណ៍ (Example)";
  } else if (type === "note") {
    bg = "#fffbeb";
    borderLeft = "#d97706";
    badgeBg = "#fef3c7";
    badgeColor = "#b45309";
    defaultTitle = "ចំណាំសំខាន់ (Important Note)";
  } else if (type === "summary") {
    bg = "#fdf2f8";
    borderLeft = "#db2777";
    badgeBg = "#fce7f3";
    badgeColor = "#be185d";
    defaultTitle = "សង្ខេបមេរៀន (Lesson Summary)";
  }

  return `<div class="jodit-lesson-box lesson-box-${type}" style="margin: 18px 0; background-color: ${bg}; border-left: 5px solid ${borderLeft}; border-radius: 10px; padding: 18px 22px; font-family: 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
    <span style="background-color: ${badgeBg}; color: ${badgeColor}; font-weight: 800; font-size: 13px; padding: 3px 10px; border-radius: 6px; text-transform: uppercase;">
      ${escapeHtml(titleKhmer || defaultTitle)}
    </span>
  </div>
  <div class="box-content" style="color: #1e293b; font-size: 14.5px; line-height: 1.7; font-weight: 500;">
    ${contentHtml}
  </div>
</div>`;
}

/**
 * Render complete MoEYS worksheet/quiz to Jodit/Word-compatible inline HTML.
 */
export function renderQuizHtml(quiz: QuizResult): string {
  const { titleKhmer, gradeTitleKhmer, questions } = quiz;

  let questionsHtml = "";
  questions.forEach((q, index) => {
    let optionsHtml = "";
    if (q.options && q.options.length > 0) {
      optionsHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin: 10px 0 14px 20px;">
        ${q.options
          .map(
            (opt) =>
              `<div style="padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; font-weight: 600;">${escapeHtml(
                opt
              )}</div>`
          )
          .join("")}
      </div>`;
    }

    questionsHtml += `
    <div class="quiz-question-item" style="margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px dashed #e2e8f0;">
      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
        <span style="color: #2563eb; margin-right: 6px;">សំណួរទី ${index + 1} ៖</span> ${escapeHtml(
      q.question
    )}
      </div>
      ${optionsHtml}
    </div>`;
  });

  // Answer Key Section
  const answersHtml = `
  <div class="quiz-answer-key" style="margin-top: 28px; padding: 18px 20px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px;">
    <div style="font-size: 15px; font-weight: 800; color: #1e3a8a; margin-bottom: 12px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px;">
      🔑 បង្ហាញចម្លើយ និងការពន្យល់ (Answer Key &amp; Explanations)
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${questions
        .map(
          (q, idx) => `
        <div style="font-size: 13.5px; color: #334155; line-height: 1.6;">
          <strong style="color: #059669;">សំណួរ ${idx + 1} ៖</strong> ចម្លើយត្រឹមត្រូវគឺ <strong>${escapeHtml(
            q.answer
          )}</strong>
          ${
            q.explanation
              ? ` — <span style="color: #64748b;">${escapeHtml(q.explanation)}</span>`
              : ""
          }
        </div>`
        )
        .join("")}
    </div>
  </div>`;

  return `<div class="moeys-worksheet" style="max-width: 720px; margin: 20px auto; padding: 28px 32px; background: #ffffff; border: 2px solid #cbd5e1; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); font-family: 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif;">
  <!-- Header Info -->
  <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 22px;">
    <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">
      ${escapeHtml(titleKhmer || "សន្លឹកកិច្ចការគណិតវិទ្យា (Math Worksheet)")}
    </div>
    <div style="font-size: 13px; font-weight: 700; color: #2563eb;">
      ${escapeHtml(gradeTitleKhmer || "កម្រិតបឋមសិក្សា")}
    </div>
    <div style="display: flex; justify-content: space-between; margin-top: 14px; font-size: 12px; color: #64748b; font-weight: 600;">
      <span>ឈ្មោះសិស្ស ៖ ............................................</span>
      <span>កាលបរិច្ឆេទ ៖ ...... / ...... / ..........</span>
      <span>ពិន្ទុ ៖ ............ / ១០</span>
    </div>
  </div>

  <!-- Questions Body -->
  <div class="worksheet-body">
    ${questionsHtml}
  </div>

  <!-- Answer Key -->
  ${answersHtml}
</div>`;
}

/**
 * Deterministically normalize quiz questions for Cambodian primary school standards:
 * 1. For multiple choice, rewrite option labels strictly to ក. ខ. គ. ឃ.
 * 2. Ensure exactly four options (replaces/augments or trims gracefully).
 * 3. Correct corrupt Khmer prefixes (such as ឆ. or English A, B, C, D).
 * 4. Synchronize answer keys so answer matches the normalized label.
 * 5. Apply safe Khmer educational text normalization.
 */
export function normalizeQuizQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  if (!Array.isArray(questions)) return [];

  const KHMER_OPTION_PREFIXES = ["ក. ", "ខ. ", "គ. ", "ឃ. "];
  const KHMER_OPTION_KEYS = ["ក", "ខ", "គ", "ឃ"];

  return questions.map((q, qIndex) => {
    const rawQuestion = normalizeKhmerEducationalText(q.question || "");
    const rawExplanation = normalizeKhmerEducationalText(q.explanation || "");
    const answer = (q.answer || "").trim();

    if (q.type !== "multiple_choice" || !q.options || q.options.length === 0) {
      return {
        ...q,
        id: q.id || qIndex + 1,
        question: rawQuestion,
        answer: normalizeKhmerEducationalText(answer),
        explanation: rawExplanation,
      };
    }

    // 1. Strip any existing prefix (e.g. A., B., C., D., ក., ខ., គ., ឃ., ឆ., 1., 2.)
    const cleanOptionTexts: string[] = q.options.map((opt) => {
      let cleaned = opt.trim();
      // Remove prefixes like "A.", "B.", "ក.", "ឆ.", "1.", "(ក)", "[A]"
      cleaned = cleaned.replace(/^(\([ក-អa-zA-Z0-9]+\)|\[[ក-អa-zA-Z0-9]+\]|[ក-អa-zA-Z0-9]+[.:\)\-]\s*)/, "").trim();
      return normalizeKhmerEducationalText(cleaned);
    });

    // 2. Ensure exactly 4 options
    while (cleanOptionTexts.length < 4) {
      const fallbackIdx = cleanOptionTexts.length + 1;
      cleanOptionTexts.push(`ចម្លើយបន្ថែម ${toKhmerNum(fallbackIdx)}`);
    }
    const finalOptionTexts = cleanOptionTexts.slice(0, 4);

    // 3. Map original answer to index 0..3
    let answerIndex = -1;
    const cleanAns = answer.replace(/[.:\s\(\)]/g, "").toUpperCase();

    if (cleanAns === "A" || cleanAns === "ក" || cleanAns === "1") answerIndex = 0;
    else if (cleanAns === "B" || cleanAns === "ខ" || cleanAns === "2") answerIndex = 1;
    else if (cleanAns === "C" || cleanAns === "គ" || cleanAns === "3") answerIndex = 2;
    else if (cleanAns === "D" || cleanAns === "ឃ" || cleanAns === "4" || cleanAns === "ឆ") answerIndex = 3;
    else {
      // Try finding match in option texts
      const matchIdx = finalOptionTexts.findIndex((t) => t.includes(cleanAns) || cleanAns.includes(t));
      if (matchIdx !== -1) {
        answerIndex = matchIdx;
      } else {
        answerIndex = 0; // deterministic safe fallback
      }
    }

    // 4. Build normalized 4 options strictly with ក. ខ. គ. ឃ.
    const normalizedOptions = finalOptionTexts.map((text, idx) => {
      return `${KHMER_OPTION_PREFIXES[idx]}${text}`;
    });

    const normalizedAnswer = `${KHMER_OPTION_KEYS[answerIndex]}. ${finalOptionTexts[answerIndex]}`;

    return {
      id: q.id || qIndex + 1,
      type: "multiple_choice",
      question: rawQuestion,
      options: normalizedOptions,
      answer: normalizedAnswer,
      explanation: rawExplanation,
    };
  });
}

function toKhmerNum(n: number): string {
  const map: Record<string, string> = { "0": "០", "1": "១", "2": "២", "3": "៣", "4": "៤", "5": "៥", "6": "៦", "7": "៧", "8": "៨", "9": "៩" };
  return String(n).replace(/[0-9]/g, (d) => map[d] || d);
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

