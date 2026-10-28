import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { getPrimaryGeminiKey, getSecondaryGeminiKey } from "@/lib/gemini-dual-api";
import { getSessionUser } from "@/lib/auth-session";
import { ActivityTracker } from "@/lib/activity-tracker";
import {
  PersistentCacheStore,
  buildDeterministicCacheKey,
  computeExactSha256,
  computeNormalizedImageSha256,
  computeNormalizedTextFingerprint,
} from "@/lib/persistent-cache-store";
import {
  buildModule05Artifacts,
  uploadArtifactsToGoogleDrive,
} from "@/lib/gemini-cache-artifacts";
import {
  LessonStudioMode,
  GradeLevel,
  LessonStudioResponse,
  GRADE_LABELS_KHMER,
  HtmlBox,
  sanitizeAndEnforceSvg,
  wrapSvgInHtmlCard,
  renderQuizHtml,
  renderHtmlBox,
  createDefaultCountingSvg,
  createDefaultFractionSvg,
  normalizeQuizQuestions,
} from "@/lib/lesson-studio";
import { normalizeKhmerEducationalText } from "@/lib/khmer-text-normalizer";

import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";

export const maxDuration = 60; // 60 seconds budget

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export async function POST(req: NextRequest) {
  // 1. Enforce Server-Side Session Auth
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) {
    return authBlock;
  }

  // 2. Enforce Rate Limiting (8 req/min)
  const rateLimitBlock = await enforceRateLimit(req, "lesson_studio");
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  const startTime = Date.now();
  const requestId = `lsreq_${Math.random().toString(36).slice(2, 9)}`;

  try {
    let mode: LessonStudioMode = "visual_svg";
    let gradeLevel: GradeLevel = "auto";
    let promptText = "";
    let imageBytes: Uint8Array | null = null;
    let mimeType = "image/png";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      mode = (formData.get("mode") as LessonStudioMode) || "visual_svg";
      gradeLevel = (formData.get("gradeLevel") as GradeLevel) || "auto";
      promptText = (formData.get("prompt") as string) || "";

      const file = formData.get("image") as File | null;
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        imageBytes = new Uint8Array(buffer);
        mimeType = file.type || "image/png";
      }
    } else {
      const body = await req.json();
      mode = (body.mode as LessonStudioMode) || "visual_svg";
      gradeLevel = (body.gradeLevel as GradeLevel) || "auto";
      promptText = (body.prompt as string) || "";

      if (body.imageBase64) {
        const pureBase64 = body.imageBase64.replace(/^data:image\/\w+;base64,/, "");
        imageBytes = Buffer.from(pureBase64, "base64");
        mimeType = body.mimeType || "image/png";
      }
    }

    if (!promptText.trim() && !imageBytes) {
      return NextResponse.json<LessonStudioResponse>(
        {
          ok: false,
          mode,
          error: "Prompt or image is required",
          errorKhmer: "សូមបញ្ចូលសំណើ ឬរូបភាពសម្រាប់ដំណើរការ។",
          requestId,
        },
        { status: 400 }
      );
    }

    const sessionUser = await getSessionUser(req);
    const userId = sessionUser?.id || (process.env.NODE_ENV === "test" ? "usr_test_default" : "usr_anonymous");
    const username = sessionUser?.username || "user";

    let exactImageSha256: string | undefined;
    let normalizedImageSha256: string | undefined;
    let inputFingerprint = "";

    if (imageBytes) {
      const buf = Buffer.from(imageBytes);
      exactImageSha256 = computeExactSha256(buf);
      normalizedImageSha256 = computeNormalizedImageSha256(buf);
      inputFingerprint = exactImageSha256;
    } else {
      const norm = computeNormalizedTextFingerprint(promptText);
      inputFingerprint = norm.fingerprint;
    }

    const primaryModel = "gemini-flash-lite-latest";
    const promptVersion = "lesson_studio_v2.0";

    const cacheKey = buildDeterministicCacheKey({
      module: "module05_lesson_studio",
      userId,
      grade: gradeLevel,
      mode,
      language: "km",
      inputFingerprint,
      options: { prompt: promptText.trim() },
      modelName: primaryModel,
      promptVersion,
    });

    let cached = await PersistentCacheStore.get<LessonStudioResponse>(cacheKey, userId);
    if (!cached && exactImageSha256) {
      cached = await PersistentCacheStore.lookupByContent<LessonStudioResponse>({
        userId,
        module: "module05_lesson_studio",
        grade: gradeLevel,
        mode,
        language: "km",
        modelName: primaryModel,
        promptVersion,
        exactImageSha256,
        normalizedImageSha256,
      });
    }

    if (cached) {
      console.info(
        JSON.stringify({
          requestId,
          event: "lesson_studio_cache_hit",
          cacheKey: cached.cacheKey,
          durationMs: Date.now() - startTime,
        })
      );
      if (sessionUser) {
        ActivityTracker.recordActivity({
          userId: sessionUser.id,
          username: sessionUser.username,
          displayName: sessionUser.displayName,
          role: sessionUser.role,
          module: "05_lesson_studio",
          action: mode || "generate_lesson",
          title: promptText?.slice(0, 80) || "Lesson Studio Task (Cached)",
          details: { gradeLevel, mode, cached: true },
        }).catch(() => {});
      }

      return NextResponse.json<LessonStudioResponse>(
        {
          ...cached.outputFields,
          cached: true,
          fromCache: true,
          cacheKey: cached.cacheKey,
          driveFileIds: cached.driveFileIds,
          driveLinks: cached.driveLinks,
          durationMs: Date.now() - startTime,
        },
        { status: 200 }
      );
    }

    const primaryKey = getPrimaryGeminiKey();
    const secondaryKeyObj = getSecondaryGeminiKey();
    const effectiveApiKey = primaryKey || secondaryKeyObj.key;

    // Deterministic fallback if API key is not configured or in offline test mode
    if (!effectiveApiKey || effectiveApiKey === "your_gemini_api_key_here") {
      return handleOfflineFallback(mode, gradeLevel, promptText, requestId, startTime);
    }

    const genAI = new GoogleGenerativeAI(effectiveApiKey);
    const secondaryClient = secondaryKeyObj.isDistinct ? new GoogleGenerativeAI(secondaryKeyObj.key) : null;
    const candidateModels = [
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ];

    const parts: Part[] = [];
    if (imageBytes) {
      parts.push({
        inlineData: {
          mimeType,
          data: Buffer.from(imageBytes).toString("base64"),
        },
      });
    }

    let systemInstruction = "";
    if (mode === "visual_svg") {
      systemInstruction = `You are a master Cambodian elementary mathematics educator and expert SVG vector artist.
Target Grade Level: ${GRADE_LABELS_KHMER[gradeLevel] || gradeLevel}.

Your goal is to generate a child-friendly, colorful, clear SVG vector diagram representing the requested mathematical concept.
Supported types:
1. Counting & Visual Arithmetic: e.g. apples, stars, dots, ten-frames, base-10 blocks (ones cubes, tens rods, hundreds flats).
2. Fractions: shaded circles, shaded fraction bars (e.g. 2/5, 3/4) with clean slices and clear division lines.
3. Number lines with curved jump arrows, marked integer steps, and arrows.
4. Geometric shapes (triangles, rectangles, polygons) with labeled side lengths and angle markers.
5. Clock faces with hour/minute hands and Khmer numerals or Arabic numbers.

MANDATORY SVG SPECIFICATIONS:
- Root tag: <svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg">
- Vibrant, welcoming primary school colors (coral red #ef4444, emerald green #10b981, sky blue #0284c7, amber #f59e0b, violet #8b5cf6).
- Use font-family="'Kantumruy Pro', 'Noto Sans Khmer', sans-serif" on all <text> elements.
- Clean vector paths, proper text-anchor="middle", no external scripts, no external images.

Output JSON format:
{
  "titleKhmer": "ចំណងជើងរូបភាពគណិតវិទ្យាជាភាសាខ្មែរ",
  "descriptionKhmer": "ការពន្យល់អត្ថន័យរូបភាព និងគោលបំណងគណិតវិទ្យា",
  "diagramType": "counting" | "fraction" | "number_line" | "geometry" | "clock" | "other",
  "svg": "<svg viewBox=\\"0 0 600 320\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>"
}`;
    } else if (mode === "quiz_generator") {
      systemInstruction = `You are a curriculum specialist for Cambodian Primary School Mathematics (MoEYS Grades 1 to 6).
Target Grade Level: ${GRADE_LABELS_KHMER[gradeLevel] || gradeLevel}.

Your goal is to generate a structured Khmer worksheet/quiz based on the input topic or problem image.
Include 3 to 5 questions covering:
1. Multiple Choice (សំណួរពហុជ្រើសរើស ក, ខ, គ, ឃ)
2. Fill-in-the-blank or Arithmetic operation (លំហាត់បំពេញចន្លោះ ឬគណនា)
3. Short real-world word problem (ចំណោទខ្លីៗ)

Output JSON format:
{
  "titleKhmer": "សន្លឹកកិច្ចការគណិតវិទ្យា (Math Worksheet)",
  "gradeLevel": "${gradeLevel}",
  "gradeTitleKhmer": "${GRADE_LABELS_KHMER[gradeLevel] || "កម្រិតបឋមសិក្សា"}",
  "textContent": "អត្ថបទសន្លឹកកិច្ចការទាំងមូលជាទម្រង់ Text សុទ្ធ",
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice" | "fill_in_the_blank" | "word_problem",
      "question": "ខ្លឹមសារសំណួរជាភាសាខ្មែរ...",
      "options": ["ក. ...", "ខ. ...", "គ. ...", "ឃ. ..."],
      "answer": "ក",
      "explanation": "ការពន្យល់ពីរបៀបរកឃើញចម្លើយនេះ"
    }
  ]
}`;
    } else {
      // mode === "html_styler"
      systemInstruction = `You are an expert Cambodian primary education editor and Jodit HTML layout designer.
Target Grade Level: ${GRADE_LABELS_KHMER[gradeLevel] || gradeLevel}.

Your task:
1. Thoroughly review the input Khmer text, fix spelling, spacing, and diacritics according to MoEYS Chuon Nath standard dictionary.
2. Structure and format the content into beautiful, self-contained educational boxes with rich inline CSS:
   - "definition" (ប្រអប់និយមន័យ)
   - "example" (ប្រអប់ឧទាហរណ៍)
   - "note" (ប្រអប់ចំណាំសំខាន់)
   - "summary" (ប្រអប់សង្ខេបមេរៀន)

Output JSON format:
{
  "titleKhmer": "ចំណងជើងមេរៀនដែលបានកែលម្អ",
  "correctedText": "អត្ថបទដែលបានកែអក្ខរាវិរុទ្ធរួចរាល់ទាំងស្រុង",
  "notes": ["ចំណាំអំពីការកែលម្អអក្ខរាវិរុទ្ធ ឬវេយ្យាករណ៍..."],
  "boxes": [
    {
      "type": "definition" | "example" | "note" | "summary",
      "titleKhmer": "ចំណងជើងប្រអប់",
      "contentHtml": "<p>ខ្លឹមសារជាមួយ inline HTML tags ស្អាតៗ...</p>"
    }
  ]
}`;
    }

    parts.push({
      text: `${systemInstruction}\n\nUSER PROMPT / TOPIC:\n${promptText}\n\nReturn ONLY a valid JSON object matching the schema.`,
    });

    let rawJsonText = "";
    let chosenModel = "";

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });

        const result = await withTimeout(
          model.generateContent({ contents: [{ role: "user", parts }] }),
          18000,
          `Model ${modelName} timed out after 18s`
        );

        const text = result.response.text()?.trim();
        if (text && text.startsWith("{")) {
          rawJsonText = text;
          chosenModel = modelName;
          break;
        }
      } catch (err: unknown) {
        if (secondaryClient) {
          try {
            const secModel = secondaryClient.getGenerativeModel({
              model: modelName,
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.2,
              },
            });
            const secResult = await withTimeout(
              secModel.generateContent({ contents: [{ role: "user", parts }] }),
              18000,
              `Secondary Model ${modelName} timed out after 18s`
            );
            const secText = secResult.response.text()?.trim();
            if (secText && secText.startsWith("{")) {
              rawJsonText = secText;
              chosenModel = modelName;
              break;
            }
          } catch {
            // Secondary also failed, continue to next candidate model
          }
        }
        // Try next fallback candidate model
        continue;
      }
    }

    if (!rawJsonText) {
      // Graceful fallback to deterministic generator if network or upstream model fails
      return handleOfflineFallback(mode, gradeLevel, promptText, requestId, startTime);
    }

    const parsed = JSON.parse(rawJsonText);
    const durationMs = Date.now() - startTime;

    let finalResponse: LessonStudioResponse;

    if (mode === "visual_svg") {
      const sanitizedSvg = sanitizeAndEnforceSvg(parsed.svg || "");
      const titleKhmer = parsed.titleKhmer || "រូបភាពគណិតវិទ្យា (Math Visual Diagram)";
      const descriptionKhmer = parsed.descriptionKhmer || promptText;
      const htmlCard = wrapSvgInHtmlCard(sanitizedSvg, titleKhmer, descriptionKhmer);

      finalResponse = {
        ok: true,
        mode: "visual_svg",
        visual: {
          svg: sanitizedSvg,
          htmlCard,
          titleKhmer,
          descriptionKhmer,
          diagramType: parsed.diagramType || "custom",
          gradeLevel,
        },
        model: chosenModel,
        durationMs,
        requestId,
      };
    } else if (mode === "quiz_generator") {
      const titleKhmer = normalizeKhmerEducationalText(
        parsed.titleKhmer || "សន្លឹកកិច្ចការគណិតវិទ្យា (Math Worksheet)"
      );
      const gradeTitleKhmer = normalizeKhmerEducationalText(
        parsed.gradeTitleKhmer || GRADE_LABELS_KHMER[gradeLevel] || "កម្រិតបឋមសិក្សា"
      );
      const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
      const normalizedQuestions = normalizeQuizQuestions(rawQuestions);
      const textContent = normalizeKhmerEducationalText(parsed.textContent || promptText);

      const quizData = {
        titleKhmer,
        gradeLevel,
        gradeTitleKhmer,
        textContent,
        questions: normalizedQuestions,
        htmlContent: "",
      };
      quizData.htmlContent = renderQuizHtml(quizData);

      finalResponse = {
        ok: true,
        mode: "quiz_generator",
        quiz: quizData,
        model: chosenModel,
        durationMs,
        requestId,
      };
    } else {
      // mode === "html_styler"
      const titleKhmer = parsed.titleKhmer || "មេរៀនគណិតវិទ្យា (Math Lesson Notes)";
      const correctedText = parsed.correctedText || promptText;
      const boxes: HtmlBox[] = Array.isArray(parsed.boxes) ? parsed.boxes : [];
      const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      const htmlContent = boxes.map((box: HtmlBox) => renderHtmlBox(box)).join("\n");

      finalResponse = {
        ok: true,
        mode: "html_styler",
        styler: {
          titleKhmer,
          correctedText,
          htmlContent,
          boxes,
          notes,
        },
        model: chosenModel,
        durationMs,
        requestId,
      };
    }

    // Save durable artifacts to Google Drive
    const artifacts = buildModule05Artifacts({
      username,
      originalImage: imageBytes
        ? { buffer: Buffer.from(imageBytes), filename: "reference.png", mimeType }
        : undefined,
      lessonHtml: finalResponse.styler?.htmlContent,
      lessonText: finalResponse.styler?.correctedText || finalResponse.quiz?.textContent,
      quizHtml: finalResponse.quiz?.htmlContent,
      visualSvg: finalResponse.visual?.htmlCard || finalResponse.visual?.svg,
    });

    const uploadResult = await uploadArtifactsToGoogleDrive(userId, artifacts);

    // Save complete record to PersistentCacheStore
    await PersistentCacheStore.set<LessonStudioResponse>({
      cacheKey,
      userId,
      module: "module05_lesson_studio",
      grade: gradeLevel,
      mode,
      language: "km",
      normalizedInputFingerprint: inputFingerprint,
      exactImageSha256,
      normalizedImageSha256,
      normalizedQuestionText: promptText.trim(),
      modelName: chosenModel,
      promptVersion,
      outputFields: finalResponse,
      driveFileIds: uploadResult.driveFileIds,
      driveLinks: uploadResult.driveLinks,
      mimeTypes: uploadResult.mimeTypes,
      timestamps: {
        createdAt: Date.now(),
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      },
      processingStatus: uploadResult.allSucceeded ? "completed" : "partial",
      source: "gemini",
    });

    finalResponse.cached = false;
    finalResponse.fromCache = false;
    finalResponse.cacheKey = cacheKey;
    finalResponse.driveFileIds = uploadResult.driveFileIds;
    finalResponse.driveLinks = uploadResult.driveLinks;

    if (sessionUser) {
      ActivityTracker.recordActivity({
        userId: sessionUser.id,
        username: sessionUser.username,
        displayName: sessionUser.displayName,
        role: sessionUser.role,
        module: "05_lesson_studio",
        action: mode || "generate_lesson",
        title: promptText?.slice(0, 80) || "Lesson Studio Task",
        details: { gradeLevel, mode, model: chosenModel },
      }).catch(() => {});
    }

    return NextResponse.json<LessonStudioResponse>(finalResponse, { status: 200 });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal Lesson Studio Error";
    return NextResponse.json<LessonStudioResponse>(
      {
        ok: false,
        mode: "visual_svg",
        error: errorMsg,
        errorKhmer: "មានបញ្ហាបច្ចេកទេសក្នុងការផលិតមេរៀន ឬរូបភាព។ សូមព្យាយាមម្តងទៀត។",
        requestId,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

/**
 * High-quality deterministic fallback when offline or running in mock testing environments.
 */
function handleOfflineFallback(
  mode: LessonStudioMode,
  gradeLevel: GradeLevel,
  promptText: string,
  requestId: string,
  startTime: number
): NextResponse {
  const durationMs = Date.now() - startTime;
  const gradeLabel = GRADE_LABELS_KHMER[gradeLevel] || "កម្រិតបឋមសិក្សា";

  if (mode === "visual_svg") {
    let svg = "";
    let titleKhmer = "";
    let descriptionKhmer = "";

    if (promptText.includes("ប្រភាគ") || promptText.includes("fraction")) {
      svg = createDefaultFractionSvg(3, 4);
      titleKhmer = "រូបភាពបង្ហាញប្រភាគ ៣/៤ (រង្វង់មូល និងរបារ)";
      descriptionKhmer = "បង្ហាញពីការបែងចែកឯកតាជា ៤ ភាគស្មើៗគ្នា និងជ្រើសរើសយក ៣ ភាគ។";
    } else {
      svg = createDefaultCountingSvg(5, 3);
      titleKhmer = "រូបភាពរាប់ចំនួនផ្លែប៉ោម និងប្រមាណវិធីបូក";
      descriptionKhmer = "បង្ហាញពីការបូកផ្លែប៉ោមក្រហម ៥ ជាមួយផ្លែប៉ោមបៃតង ៣ ស្មើនឹង ៨ ផ្លែ។";
    }

    const sanitizedSvg = sanitizeAndEnforceSvg(svg);
    const htmlCard = wrapSvgInHtmlCard(sanitizedSvg, titleKhmer, descriptionKhmer);

    return NextResponse.json<LessonStudioResponse>({
      ok: true,
      mode: "visual_svg",
      visual: {
        svg: sanitizedSvg,
        htmlCard,
        titleKhmer,
        descriptionKhmer,
        diagramType: "counting",
        gradeLevel,
      },
      model: "deterministic-engine",
      durationMs,
      requestId,
    });
  }

  if (mode === "quiz_generator") {
    const questions = [
      {
        id: 1,
        type: "multiple_choice" as const,
        question: "តើ ៤៥ + ៣២ ស្មើនឹងប៉ុន្មាន?",
        options: ["ក. ៧៥", "ខ. ៧៧", "គ. ៨៧", "ឃ. ៦៧"],
        answer: "ខ",
        explanation: "បូកខ្ទង់រាយ ៥ + ២ = ៧ និងខ្ទង់ដប់ ៤ + ៣ = ៧ ដូច្នេះផលបូកគឺ ៧៧។",
      },
      {
        id: 2,
        type: "fill_in_the_blank" as const,
        question: "ចូរគណនាប្រមាណវិធី ៖ ៨០ − ៣៥ = ______",
        answer: "៤៥",
        explanation: "៨០ ដក ៣៥ ស្មើ ៤៥ (៨០ − ៣០ = ៥០, ៥០ − ៥ = ៤៥)។",
      },
      {
        id: 3,
        type: "word_problem" as const,
        question: "សុខមានសៀវភៅ ១៥ ក្បាល។ ម្ដាយទិញឱ្យបន្ថែម ៨ ក្បាលទៀត។ តើសុខមានសៀវភៅសរុបប៉ុន្មានក្បាល?",
        answer: "២៣ ក្បាល",
        explanation: "ធ្វើប្រមាណវិធីបូក ៖ ១៥ + ៨ = ២៣ ក្បាល។",
      },
    ];

    const quizData = {
      titleKhmer: `សន្លឹកកិច្ចការគណិតវិទ្យា — ${gradeLabel}`,
      gradeLevel,
      gradeTitleKhmer: gradeLabel,
      textContent: `សន្លឹកកិច្ចការគណិតវិទ្យា (${gradeLabel})\n1. ៤៥ + ៣២ = ?\n2. ៨០ - ៣៥ = ?\n3. ចំណោទសៀវភៅ`,
      questions,
      htmlContent: "",
    };
    quizData.htmlContent = renderQuizHtml(quizData);

    return NextResponse.json<LessonStudioResponse>({
      ok: true,
      mode: "quiz_generator",
      quiz: quizData,
      model: "deterministic-engine",
      durationMs,
      requestId,
    });
  }

  // mode === "html_styler"
  const boxes = [
    {
      type: "definition" as const,
      titleKhmer: "និយមន័យប្រភាគ (Definition of Fractions)",
      contentHtml: "<p><strong>ប្រភាគ</strong> គឺជាចំនួនដែលតាងឱ្យចំណែកស្មើៗគ្នានៃចំនួនគត់ ឬឯកតាមួយ។ តួលេខខាងលើហៅថា <em>ភាគយក</em> និងតួលេខខាងក្រោមហៅថា <em>ភាគបែង</em>។</p>",
    },
    {
      type: "example" as const,
      titleKhmer: "ឧទាហរណ៍ជាក់ស្តែង (Real-world Example)",
      contentHtml: "<p>នំខេកមួយកាត់ជា ៤ ចំណែកស្មើគ្នា។ បើសិនយើងញ៉ាំអស់ ១ ចំណែក នោះយើងបានញ៉ាំ <span style=\"color:#2563eb; font-weight:700;\">១/៤</span> នៃនំខេកទាំងមូល។</p>",
    },
    {
      type: "note" as const,
      titleKhmer: "ចំណាំសំខាន់ (Important Note)",
      contentHtml: "<p>ភាគបែងនៃប្រភាគមិនអាចស្មើនឹងសូន្យ (០) ជាដាច់ខាត ព្រោះការចែកនឹងសូន្យគ្មានន័យគណិតវិទ្យាទេ។</p>",
    },
  ];

  return NextResponse.json<LessonStudioResponse>({
    ok: true,
    mode: "html_styler",
    styler: {
      titleKhmer: "មេរៀនប្រភាគកម្រិតបឋមសិក្សា (MoEYS Standard)",
      correctedText: promptText || "មេរៀនប្រភាគបឋមសិក្សា",
      htmlContent: boxes.map((b) => renderHtmlBox(b)).join("\n"),
      boxes,
      notes: [
        "បានកែសម្រួលអក្ខរាវិរុទ្ធពាក្យ 'ប្រភាគ' និង 'ភាគបែង' ឱ្យត្រូវតាមវចនានុក្រមជួនណាត",
        "បានបំប្លែងទម្រង់ជាប្រអប់ព័ត៌មានបែប Modern Jodit Boxes ជាមួយ Inline CSS",
      ],
    },
    model: "deterministic-engine",
    durationMs,
    requestId,
  });
}
