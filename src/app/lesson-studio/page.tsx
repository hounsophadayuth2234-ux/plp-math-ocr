"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Palette,
  FileText,
  Sparkles,
  BookOpen,
  Copy,
  Check,
  Download,
  Printer,
  Upload,
  X,
  RefreshCw,
  XCircle,
  Eye,
  Code2,
  CheckCircle2,
  AlertCircle,
  Layers,
  GraduationCap,
} from "lucide-react";
import {
  LessonStudioMode,
  GradeLevel,
  LessonStudioResponse,
} from "@/lib/lesson-studio";
import { ModuleDriveSync } from "@/components/drive/ModuleDriveSync";
import { useModuleDriveUpload } from "@/hooks/useModuleDriveUpload";
import { formatDriveFilename, DriveUploadOptions } from "@/lib/drive-upload-client";

const PRESETS: Record<LessonStudioMode, Array<{ label: string; prompt: string; grade: GradeLevel }>> = {
  visual_svg: [
    {
      label: "ផ្លែប៉ោម ៥ + ៣ (ការរាប់)",
      prompt: "រូបផ្លែប៉ោមក្រហម ៥ បូកនឹងផ្លែប៉ោមបៃតង ៣ បង្ហាញការរាប់ចំនួន និងផលបូក",
      grade: "grade_1",
    },
    {
      label: "ប្រភាគ ៣/៤ (រង្វង់ & របារ)",
      prompt: "រូបប្រភាគ ៣/៤ ជារង្វង់មូល និងរបារប្រភាគ ផាត់ពណ៌ច្បាស់ៗ",
      grade: "grade_4",
    },
    {
      label: "ដុំគូបលេខ ៣៤ (Base-10)",
      prompt: "រូបដុំគូបខ្ទង់រាយ (៤ ដុំ) និងខ្ទង់ដប់ (៣ បន្ទះ) សម្រាប់លេខ ៣៤",
      grade: "grade_2",
    },
    {
      label: "មុខនាឡិកា ម៉ោង ៣:៣០",
      prompt: "រូបមុខនាឡិកាបង្ហាញម៉ោង ៣ និង ៣០ នាទី ជាមួយទ្រនិចម៉ោង និងទ្រនិចនាទីច្បាស់ៗ",
      grade: "grade_3",
    },
    {
      label: "បន្ទាត់ចំនួន ០ ដល់ ២០",
      prompt: "បន្ទាត់ចំនួនពី ០ ដល់ ២០ មានព្រួញលោតម្ដង ៥ ជំហាន (០ -> ៥ -> ១០ -> ១៥ -> ២០)",
      grade: "grade_2",
    },
  ],
  quiz_generator: [
    {
      label: "បូកដកត្រឹម ១០០ (ថ្នាក់ទី ២)",
      prompt: "បង្កើតលំហាត់បូកដកលេខត្រឹម ១០០ ចំនួន ៥ សំណួរ (ពហុជ្រើសរើស និងបំពេញចន្លោះ) សម្រាប់សិស្សថ្នាក់ទី ២",
      grade: "grade_2",
    },
    {
      label: "វិញ្ញាសាប្រភាគ (ថ្នាក់ទី ៤)",
      prompt: "វិញ្ញាសាប្រភាគពហុជ្រើសរើស ក ខ គ ឃ ចំនួន ៥ សំណួរ ជាមួយចំណោទជីវភាពរស់នៅ សម្រាប់ថ្នាក់ទី ៤",
      grade: "grade_4",
    },
    {
      label: "ចំណោទប្រាក់រៀល (ថ្នាក់ទី ៣)",
      prompt: "លំហាត់ចំណោទប្រាក់រៀល និងការទិញទំនិញ ៣ សំណួរ ស្របតាមសៀវភៅគោលគណិតវិទ្យាថ្នាក់ទី ៣",
      grade: "grade_3",
    },
    {
      label: "ធរណីមាត្របរិមាត្រ (ថ្នាក់ទី ៥)",
      prompt: "វិញ្ញាសាធរណីមាត្ររកបរិមាត្រ និងផ្ទៃក្រឡាចតុកោណកែង/ត្រីកោណ ចំនួន ៤ សំណួរ ថ្នាក់ទី ៥",
      grade: "grade_5",
    },
  ],
  html_styler: [
    {
      label: "ប្រអប់និយមន័យ & ឧទាហរណ៍ Jodit",
      prompt: "បម្លែងអត្ថបទមេរៀននេះទៅជាប្រអប់និយមន័យ និងឧទាហរណ៍ស្អាតៗសម្រាប់ដាក់ក្នុង Jodit Editor ៖\nប្រភាគគឺចំនួនដែលសម្គាល់ចំណែកនៃឯកតា។ ឧទាហរណ៍ នំខេកកាត់ជា ៤ ញ៉ាំ ១ សល់ ៣/៤។ ចំណាំៈ ភាគបែងមិនអាចសូន្យទេ។",
      grade: "grade_4",
    },
    {
      label: "កែអក្ខរាវិរុទ្ធ & ចំណាំសំខាន់",
      prompt: "កែសម្រួលអក្ខរាវិរុទ្ធនិងពាក្យគណិតវិទ្យា ៖\nប្រមាណវិធីគុណចំនួនទសភាគ ត្រូវរាប់ចំនួនខ្ទង់ក្បៀសនៃតួគុណទាំងពីរ រួចដាក់ក្បៀសនៅផលគុណពីស្តាំទៅឆ្វេង។",
      grade: "grade_5",
    },
    {
      label: "សង្ខេបមេរៀនចែកលេខមានសំណល់",
      prompt: "រៀបចំជាប្រអប់សង្ខេបមេរៀនស្អាតៗ ៖\nការចែកលេខមានសំណល់ គឺតំណាងចែក = (តូចែក × ផលចែក) + សំណល់ ដោយសំណល់ត្រូវតែតូចជាងតូចែកជានិច្ច។",
      grade: "grade_3",
    },
  ],
};

const STAGES = [
  "កំពុងវិភាគខ្លឹមសារគរុកោសល្យ...",
  "កំពុងគូសវាស និងបង្កើតកូដ SVG/HTML...",
  "កំពុងផ្ទៀងផ្ទាត់រចនាបថ និងអក្ខរាវិរុទ្ធ...",
  "រួចរាល់!",
];

export default function LessonStudioPage() {
  const [mode, setMode] = useState<LessonStudioMode>("visual_svg");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>(() => PRESETS.visual_svg[0]?.grade || "grade_1");
  const [promptText, setPromptText] = useState<string>(() => PRESETS.visual_svg[0]?.prompt || "");
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(null);

  // Google Drive integration for Module 05
  const driveSync = useModuleDriveUpload({
    moduleName: "Module 05: Lesson Studio",
    defaultSaveToDrive: false,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [stageIndex, setStageIndex] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const [result, setResult] = useState<LessonStudioResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState<boolean>(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const switchTab = useCallback((newMode: LessonStudioMode) => {
    setMode(newMode);
    setResult(null);
    setErrorMsg(null);
    const preset = PRESETS[newMode][0];
    if (preset) {
      setPromptText(preset.prompt);
      setGradeLevel(preset.grade);
    }
  }, []);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("សូមជ្រើសរើសឯកសារជារូបភាព (PNG, JPG, WebP)។");
      return;
    }

    const preview = URL.createObjectURL(file);
    setSelectedImage({ file, preview });
    driveSync.resetDriveState();
    setErrorMsg(null);
  };

  const removeSelectedImage = () => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.preview);
    }
    setSelectedImage(null);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsLoading(false);
    setErrorMsg("អ្នកបានបោះបង់ដំណើរការ។");
  };

  const handleGenerate = async () => {
    if (!promptText.trim() && !selectedImage) {
      setErrorMsg("សូមបញ្ចូលសំណើ ឬជ្រើសរើសរូបភាពគំរូ។");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);
    setStageIndex(0);
    setElapsedTime(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setElapsedTime(elapsed);
      if (elapsed >= 1 && elapsed < 4) setStageIndex(1);
      else if (elapsed >= 4 && elapsed < 8) setStageIndex(2);
      else if (elapsed >= 8) setStageIndex(3);
    }, 500);

    try {
      let response: Response;

      if (selectedImage) {
        const formData = new FormData();
        formData.append("mode", mode);
        formData.append("gradeLevel", gradeLevel);
        formData.append("prompt", promptText);
        formData.append("image", selectedImage.file);

        response = await fetch("/api/lesson-studio", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } else {
        response = await fetch("/api/lesson-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            gradeLevel,
            prompt: promptText,
          }),
          signal: controller.signal,
        });
      }

      if (timerRef.current) clearInterval(timerRef.current);

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.errorKhmer || errJson?.error || `Server Error ${response.status}`);
      }

      const data: LessonStudioResponse = await response.json();
      if (!data.ok) {
        throw new Error(data.errorKhmer || data.error || "បរាជ័យក្នុងការផលិតខ្លឹមសារ");
      }

      setResult(data);

      // Automatic Google Drive upload (Module 05: reference input image + generated lesson/worksheet outputs)
      const drivePayloads: DriveUploadOptions[] = [];
      const timestamp = Date.now();
      const username = driveSync.currentUser;

      if (selectedImage?.file) {
        const ext = (selectedImage.file.name || "image.png").split(".").pop() || "png";
        drivePayloads.push({
          file: selectedImage.file,
          filename: formatDriveFilename({
            modulePrefix: "module05_lesson_studio",
            userIdOrName: username,
            outputType: "reference",
            extension: ext,
            timestamp,
          }),
          description: "Module 05 Lesson Studio Reference Input Image",
        });
      }

      if (data.visual) {
        const svgHtml = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="utf-8">
  <title>${data.visual.titleKhmer || "Math Visual Diagram"}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; text-align: center; background: #ffffff; color: #1e293b; }
    .container { max-width: 800px; margin: 0 auto; }
    .svg-wrap { display: inline-block; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>${data.visual.titleKhmer || "គំនូរបំព្រួញគណិតវិទ្យា"}</h2>
    <p>${data.visual.descriptionKhmer || ""}</p>
    <div class="svg-wrap">${data.visual.svg}</div>
  </div>
</body>
</html>`;
        drivePayloads.push({
          content: svgHtml,
          filename: formatDriveFilename({
            modulePrefix: "module05_lesson_studio",
            userIdOrName: username,
            outputType: "visual_diagram",
            extension: "html",
            timestamp,
          }),
          mimeType: "text/html; charset=utf-8",
          description: "Module 05 Lesson Studio Visual Diagram HTML Document",
        });
      }

      if (data.quiz) {
        const quizHtml = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="utf-8">
  <title>${data.quiz.titleKhmer || "Math Quiz Worksheet"}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; background: #ffffff; }
    .container { max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    ${data.quiz.htmlContent}
  </div>
</body>
</html>`;
        drivePayloads.push({
          content: quizHtml,
          filename: formatDriveFilename({
            modulePrefix: "module05_lesson_studio",
            userIdOrName: username,
            outputType: "quiz_worksheet",
            extension: "html",
            timestamp,
          }),
          mimeType: "text/html; charset=utf-8",
          description: "Module 05 Lesson Studio Quiz Worksheet HTML Document",
        });

        if (data.quiz.textContent) {
          drivePayloads.push({
            content: data.quiz.textContent,
            filename: formatDriveFilename({
              modulePrefix: "module05_lesson_studio",
              userIdOrName: username,
              outputType: "quiz_questions",
              extension: "txt",
              timestamp,
            }),
            mimeType: "text/plain; charset=utf-8",
            description: "Module 05 Lesson Studio Quiz Questions Plain Text",
          });
        }
      }

      if (data.styler) {
        const lessonHtml = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="utf-8">
  <title>${data.styler.titleKhmer || "Math Lesson Plan"}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; background: #ffffff; }
    .container { max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    ${data.styler.htmlContent}
  </div>
</body>
</html>`;
        drivePayloads.push({
          content: lessonHtml,
          filename: formatDriveFilename({
            modulePrefix: "module05_lesson_studio",
            userIdOrName: username,
            outputType: "lesson_plan",
            extension: "html",
            timestamp,
          }),
          mimeType: "text/html; charset=utf-8",
          description: "Module 05 Lesson Studio Lesson Plan HTML Document",
        });

        if (data.styler.correctedText) {
          drivePayloads.push({
            content: data.styler.correctedText,
            filename: formatDriveFilename({
              modulePrefix: "module05_lesson_studio",
              userIdOrName: username,
              outputType: "lesson_content",
              extension: "txt",
              timestamp,
            }),
            mimeType: "text/plain; charset=utf-8",
            description: "Module 05 Lesson Studio Plain Text Content",
          });
        }
      }

      if (drivePayloads.length > 0) {
        driveSync.triggerUpload(drivePayloads).catch((driveErr) => {
          console.warn("[Module 05] Non-blocking Google Drive upload warning:", driveErr);
        });
      }

      setIsLoading(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : "មានកំហុសបច្ចេកទេសក្នុងការទាក់ទងម៉ាស៊ីនបម្រើ។";
      setErrorMsg(msg);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setErrorMsg("មិនអាចចម្លងទៅ Clipboard បានទេ។");
    }
  };

  const downloadHtmlFile = () => {
    if (!result) return;
    let content = "";
    let filename = "lesson-content.html";

    if (result.visual) {
      content = result.visual.htmlCard;
      filename = "math-visual-diagram.html";
    } else if (result.quiz) {
      content = result.quiz.htmlContent;
      filename = "math-worksheet.html";
    } else if (result.styler) {
      content = result.styler.htmlContent;
      filename = "jodit-boxes.html";
    }

    const fullDoc = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="UTF-8">
  <title>PLP Math Lesson Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Kantumruy Pro', sans-serif; background: #f8fafc; padding: 30px; margin: 0; color: #1e293b; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;

    const blob = new Blob([fullDoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPngImage = async () => {
    if (!result) return;
    try {
      const docWithFonts = document as unknown as { fonts?: { ready: Promise<void> } };
      if (typeof document !== "undefined" && docWithFonts.fonts) {
        await docWithFonts.fonts.ready;
      }

      // If SVG result, convert SVG to PNG directly
      if (result.visual?.svg) {
        const svgString = result.visual.svg;
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = 2; // Retina 2x HD
          canvas.width = 600 * scale;
          canvas.height = 320 * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          URL.revokeObjectURL(url);
          const pngUrl = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = "math-visual-hd.png";
          a.click();
        };
        img.src = url;
        return;
      }

      // Fallback: print view
      window.print();
    } catch {
      setErrorMsg("មិនអាចបំប្លែងជារូបភាព PNG បានទេ។ សូមប្រើមុខងារបោះពុម្ពជំនួសវិញ។");
    }
  };

  const printContent = () => {
    window.print();
  };

  return (
    <div className="space-y-6 font-sans text-slate-100 max-w-7xl mx-auto pb-16">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
            title="ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-rose-400">MODULE 05</span>
              <span className="rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                ACTIVE
              </span>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                MoEYS Grades 1–6 Standard
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white font-sans mt-0.5">
              ផលិតមេរៀន &amp; រូបភាពគណិត (AI Lesson &amp; Visual Studio)
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Sparkles className="h-4 w-4 text-rose-400" />
          <span>Gemini AI Engine · Child-Friendly Vectors &amp; Jodit HTML</span>
        </div>
      </div>

      {/* ── Mode Tabs Switcher ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => switchTab("visual_svg")}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            mode === "visual_svg"
              ? "bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-lg shadow-rose-950/40 border border-rose-500/40"
              : "text-slate-300 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Palette className="h-4 w-4" />
          <span>🎨 គូសរូបភាពគណិត (Visual SVG)</span>
        </button>

        <button
          type="button"
          onClick={() => switchTab("quiz_generator")}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            mode === "quiz_generator"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-950/40 border border-blue-500/40"
              : "text-slate-300 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>📝 បង្កើតសន្លឹកកិច្ចការ (Quiz &amp; Sheet)</span>
        </button>

        <button
          type="button"
          onClick={() => switchTab("html_styler")}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            mode === "html_styler"
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/40 border border-emerald-500/40"
              : "text-slate-300 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>✨ កែអក្ខរាវិរុទ្ធ &amp; រចនា HTML Box</span>
        </button>
      </div>

      {/* ── Main Studio Layout (Grid: Input Left / Output Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Inputs & Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* Grade Level Selector */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider font-sans">
                <GraduationCap className="h-4 w-4 text-rose-400" />
                កម្រិតថ្នាក់ (MoEYS Grade Level)
              </label>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(["grade_1", "grade_2", "grade_3", "grade_4", "grade_5", "grade_6"] as GradeLevel[]).map(
                (g, idx) => {
                  const isSelected = gradeLevel === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGradeLevel(g)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-all border ${
                        isSelected
                          ? "bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-950/50"
                          : "bg-slate-900/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      ថ្នាក់ទី {idx + 1}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* 1-Click Sample Presets */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 font-sans">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                គំរូសាកល្បងរហ័ស (1-Click Sample Presets)
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS[mode].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPromptText(p.prompt);
                    setGradeLevel(p.grade);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-900/90 hover:bg-slate-800 hover:border-slate-600 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white transition-all text-left"
                >
                  ⚡ {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* User Prompt Textarea */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="prompt-input"
                className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider font-sans"
              >
                <FileText className="h-4 w-4 text-cyan-400" />
                សំណើ / ខ្លឹមសារមេរៀន (Prompt / Notes)
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {promptText.length} characters
              </span>
            </div>

            <textarea
              id="prompt-input"
              rows={5}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={
                mode === "visual_svg"
                  ? "ឧទាហរណ៍ ៖ គូសរូបផ្លែប៉ោមក្រហម ៥ បូកផ្លែប៉ោមបៃតង ៣ បង្ហាញការរាប់ចំនួន និងផលបូក..."
                  : mode === "quiz_generator"
                  ? "ឧទាហរណ៍ ៖ បង្កើតវិញ្ញាសាប្រភាគពហុជ្រើសរើស ក ខ គ ឃ ចំនួន ៥ សំណួរ ថ្នាក់ទី ៤..."
                  : "ឧទាហរណ៍ ៖ បញ្ចូលកំណត់ត្រាមេរៀន ឬនិយមន័យដែលចង់កែអក្ខរាវិរុទ្ធ និងរៀបចំជា HTML Box..."
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-none transition-all leading-relaxed"
            />

            {/* Optional Image Upload Dropzone */}
            <div className="pt-1">
              {selectedImage ? (
                <div className="relative rounded-xl border border-rose-500/40 bg-slate-900 p-2.5 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedImage.preview}
                    alt="Preview"
                    className="h-14 w-14 rounded-lg object-cover border border-slate-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">
                      {selectedImage.file.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {(selectedImage.file.size / 1024).toFixed(1)} KB · រូបភាពគំរូ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeSelectedImage}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                    title="ដករូបភាពចេញ"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 hover:border-slate-600 bg-slate-900/40 p-3 cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-all">
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span>បញ្ចូលរូបភាពលំហាត់ពីសៀវភៅ (ស្រេចចិត្ត / Optional Image)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Module 05 Google Drive Storage Sync Card */}
            <ModuleDriveSync
              moduleName="Module 05: Lesson Studio"
              status={driveSync.status}
              uploadedRecords={driveSync.uploadedRecords}
              uploadedRecord={driveSync.uploadedRecord}
              errorMessage={driveSync.errorMessage}
              onRetry={driveSync.retryUpload}
              compact
            />

            {/* Action Button & Active Progress */}
            <div className="pt-2">
              {isLoading ? (
                <div className="space-y-3 rounded-xl border border-rose-500/40 bg-rose-950/20 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-rose-300 flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
                      {STAGES[stageIndex]}
                    </span>
                    <span className="font-mono text-slate-400">{elapsedTime}s</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-rose-500 to-pink-500 h-1.5 transition-all duration-300"
                      style={{ width: `${Math.min(95, (stageIndex + 1) * 25 + elapsedTime * 2)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-rose-300 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>បោះបង់ដំណើរការ (Cancel)</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-sm shadow-xl shadow-rose-950/50 border border-rose-500/50 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {mode === "visual_svg"
                      ? "🎨 គូសរូបភាព SVG ភ្លាមៗ (Generate SVG)"
                      : mode === "quiz_generator"
                      ? "📝 បង្កើតសន្លឹកកិច្ចការ (Generate Worksheet)"
                      : "✨ កែអក្ខរាវិរុទ្ធ & រចនា HTML Box"}
                  </span>
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1 leading-relaxed">{errorMsg}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Output & Export Bar */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:p-5 shadow-xl flex flex-col h-full min-h-[540px]">
            {/* Output Bar Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-950 border border-rose-500/40 text-rose-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans">
                    លទ្ធផលសម្រេច (Studio Output &amp; Preview)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {result ? `Engine: ${result.model} · ដំណើរការក្នុង ${((result.durationMs || 0) / 1000).toFixed(1)}s` : "រង់ចាំការបញ្ជា..."}
                  </p>
                </div>
              </div>

              {/* View Mode Toggle: Preview vs HTML Code */}
              {result && (
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setViewMode("preview")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "preview"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Visual Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("code")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "code"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>HTML Code</span>
                  </button>
                </div>
              )}
            </div>

            {/* Main Output Body */}
            <div className="flex-1 py-4 overflow-y-auto">
              {!result && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-600">
                    <Palette className="h-8 w-8" />
                  </div>
                  <div className="max-w-md">
                    <p className="text-sm font-semibold text-slate-300">
                      មិនទាន់មានទិន្នន័យនៅឡើយទេ
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      សូមជ្រើសរើស Mode ខាងលើ រួចចុចលើប៊ូតុងគំរូសាកល្បង ឬសរសេរបញ្ជាដើម្បីផលិតរូបភាព SVG ឬវិញ្ញាសាភ្លាមៗ។
                    </p>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <RefreshCw className="h-8 w-8 text-rose-500 animate-spin" />
                  <p className="text-sm font-bold text-rose-300">{STAGES[stageIndex]}</p>
                  <p className="text-xs text-slate-500">កំពុងរៀបចំទម្រង់តាមស្ដង់ដារសៀវភៅគោលក្រសួងអប់រំ...</p>
                </div>
              )}

              {result && viewMode === "preview" && (
                <div ref={previewRef} className="space-y-4">
                  {/* Mode 1: Visual SVG */}
                  {result.visual && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-800 bg-white p-4 shadow-sm text-center">
                        <div
                          className="w-full flex justify-center items-center overflow-x-auto"
                          dangerouslySetInnerHTML={{ __html: result.visual.svg }}
                        />
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                        <h4 className="text-xs font-bold text-rose-400">
                          {result.visual.titleKhmer}
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {result.visual.descriptionKhmer}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Quiz Generator */}
                  {result.quiz && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-blue-400">
                          {result.quiz.titleKhmer} ({result.quiz.gradeTitleKhmer})
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAnswerKey(!showAnswerKey)}
                          className="text-xs font-semibold text-rose-400 hover:text-rose-300 underline"
                        >
                          {showAnswerKey ? "លាក់ចម្លើយ (Hide Key)" : "បង្ហាញចម្លើយ (Show Key)"}
                        </button>
                      </div>

                      <div
                        className="rounded-xl border border-slate-800 bg-white p-5 text-slate-900 shadow-sm"
                        dangerouslySetInnerHTML={{
                          __html: showAnswerKey
                            ? result.quiz.htmlContent
                            : result.quiz.htmlContent.replace(
                                /<div class="quiz-answer-key"[\s\S]*?<\/div>\s*<\/div>$/,
                                "</div>"
                              ),
                        }}
                      />
                    </div>
                  )}

                  {/* Mode 3: HTML Styler */}
                  {result.styler && (
                    <div className="space-y-4">
                      {result.styler.notes && result.styler.notes.length > 0 && (
                        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                          <p className="text-xs font-bold text-emerald-400 mb-1">
                            ចំណុចកែសម្រួលអក្ខរាវិរុទ្ធ (Proofreading Notes) ៖
                          </p>
                          <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                            {result.styler.notes.map((note, idx) => (
                              <li key={idx}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div
                        className="rounded-xl border border-slate-800 bg-white p-5 text-slate-900 shadow-sm"
                        dangerouslySetInnerHTML={{ __html: result.styler.htmlContent }}
                      />
                    </div>
                  )}
                </div>
              )}

              {result && viewMode === "code" && (
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[500px]">
                    {result.visual?.htmlCard ||
                      result.quiz?.htmlContent ||
                      result.styler?.htmlContent ||
                      ""}
                  </pre>
                </div>
              )}
            </div>

            {/* Bottom Export & Action Toolbar */}
            {result && (
              <div className="pt-3.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Copy HTML for Jodit */}
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        result.visual?.htmlCard ||
                          result.quiz?.htmlContent ||
                          result.styler?.htmlContent ||
                          "",
                        "html"
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white transition-all focus:ring-1 focus:ring-rose-500"
                  >
                    {copiedKey === "html" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-rose-400" />
                    )}
                    <span>{copiedKey === "html" ? "ចម្លងរួចរាល់!" : "ចម្លង HTML (Jodit)"}</span>
                  </button>

                  {/* Copy Text / SVG */}
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        result.visual?.svg ||
                          result.quiz?.textContent ||
                          result.styler?.correctedText ||
                          "",
                        "text"
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all"
                  >
                    {copiedKey === "text" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span>
                      {result.visual ? "ចម្លងកូដ SVG" : "ចម្លងអត្ថបទសុទ្ធ"}
                    </span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Download HD PNG */}
                  {result.visual && (
                    <button
                      type="button"
                      onClick={downloadPngImage}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold shadow-md shadow-rose-950/40 transition-all"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>ទាញយក PNG (HD)</span>
                    </button>
                  )}

                  {/* Download HTML */}
                  <button
                    type="button"
                    onClick={downloadHtmlFile}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <span>ទាញយក HTML</span>
                  </button>

                  {/* Print */}
                  <button
                    type="button"
                    onClick={printContent}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all"
                  >
                    <Printer className="h-3.5 w-3.5 text-slate-400" />
                    <span>បោះពុម្ព (Print)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
