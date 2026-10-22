"use client";

import React, { useEffect, useRef } from "react";
import { X, BookOpen, Calculator, Eraser, Sparkles, Brain, ShieldCheck } from "lucide-react";

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpGuideModal({ isOpen, onClose }: HelpGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-guide-title"
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl text-slate-100 font-sans"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 id="help-guide-title" className="text-base font-bold text-white">
                សៀវភៅណែនាំការប្រើប្រាស់ (User Guide &amp; Help)
              </h2>
              <p className="text-xs text-slate-400">
                របៀបប្រើប្រាស់ DYT ECOSYSTEM AI Workspace ប្រកបដោយប្រសិទ្ធភាព
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help guide"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-xs leading-relaxed text-slate-300">
          {/* Module 01 */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm text-cyan-300">
              <Calculator className="h-4 w-4" />
              <span>Module 01: Math Content / OCR</span>
            </h3>
            <p className="mt-1 text-slate-300">
              បំប្លែងរូបភាព ឬរូបមន្តគណិតវិទ្យាទៅជាទម្រង់ LaTeX, Jodit HTML (មានតម្រឹមបញ្ឈរ), និង MathML។
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-slate-400">
              <li>បញ្ចូលរូបភាពរូបមន្ត ឬវាយអត្ថបទគណិតវិទ្យាផ្ទាល់</li>
              <li>ជ្រើសរើស Tab ដើម្បីមើលលទ្ធផលជា Visual Preview, LaTeX, HTML ឬ MathML</li>
              <li>ចុចប៊ូតុង &ldquo;Copy&rdquo; ឬ &ldquo;Download&rdquo; ដើម្បីយកទៅប្រើប្រាស់ភ្លាមៗ</li>
            </ul>
          </div>

          {/* Module 02 */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm text-emerald-300">
              <Eraser className="h-4 w-4" />
              <span>Module 02: Background Remover (កាត់ផ្ទៃខាងក្រោយ)</span>
            </h3>
            <p className="mt-1 text-slate-300">
              កាត់ផ្ទៃខាងក្រោយរូបភាពដោយស្វ័យប្រវត្តិ រក្សាទុកមនុស្ស ឬអក្សរខ្មែរយ៉ាងច្បាស់ល្អិតល្អន់។
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-slate-400">
              <li>ដំណើរការតាម 5 ជំហានងាយៗ: បញ្ចូលរូបភាព &rarr; ជ្រើសរើសគោលដៅ &rarr; ជ្រើសរើសគុណភាព &rarr; ចុចកាត់ &rarr; ទាញយក</li>
              <li>ផ្លាស់ប្តូរពណ៌ផ្ទៃខាងក្រោយភ្លាមៗ (Transparent, Off-White, Soft Pink, ឬពណ៌តាមចិត្ត) ដោយមិនបាច់ផ្ទុកឡើងម្តងទៀត</li>
              <li>ទាញយកជា PNG, JPG, ឬ WebP ផ្ទាល់ពីផ្ទាំងកាត់</li>
            </ul>
          </div>

          {/* Module 03 */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm text-amber-300">
              <Sparkles className="h-4 w-4" />
              <span>Module 03: HD Resize &amp; Sharpen (ពង្រីកនិងបង្កើនគុណភាព)</span>
            </h3>
            <p className="mt-1 text-slate-300">
              ពង្រីករូបភាព 2x ឬ 4x ដោយប្រើបច្ចេកវិទ្យា Lanczos-3 &amp; Super-Resolution ថែរក្សាអក្សរខ្មែរមិនឱ្យបែក។
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-slate-400">
              <li>ជ្រើសរើសកម្រិត Fast (2x លឿន), Balanced, ឬ Quality (4x Ultra HD)</li>
              <li>ប្រៀបធៀបរូបភាពមុន និងក្រោយតាមរយៈ Before/After Slider</li>
            </ul>
          </div>

          {/* Module 04 */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm text-violet-300">
              <Brain className="h-4 w-4" />
              <span>Module 04: Khmer Math Solver (ដោះស្រាយលំហាត់គណិតវិទ្យា)</span>
            </h3>
            <p className="mt-1 text-slate-300">
              ដោះស្រាយប្រមាណវិធីបូក ដក គុណ ចែក ជាភាសាខ្មែរ ជាមួយនឹងតារាងប្រមាណវិធីបញ្ឈរត្រឹមត្រូវ។
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-slate-400">
              <li>ជ្រើសរើសថ្នាក់ទី ១ ដល់ទី ៦ និងសាកល្បងលំហាត់គំរូ</li>
              <li>ពិនិត្យអត្ថបទដែលស្កេនបាន មុននឹងចុចដោះស្រាយ</li>
              <li>ប្រើប្រាស់ &ldquo;Copy Clean Text&rdquo; ឬ &ldquo;Copy Styled HTML&rdquo; សម្រាប់ការបង្រៀននិងរៀបចំឯកសារ</li>
            </ul>
          </div>

          {/* Privacy & Security */}
          <div className="flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3 text-cyan-200">
            <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-400" />
            <div>
              <span className="font-semibold text-white">ឯកជនភាព និងសុវត្ថិភាព 100%:</span>
              <p className="text-[11px] text-cyan-300/90 mt-0.5">
                ដំណើរការ AI ភាគច្រើនប្រព្រឹត្តទៅលើ Browser របស់អ្នកផ្ទាល់ (On-Device Client-Side) ដោយមិនបញ្ជូនរូបភាពផ្ទាល់ខ្លួនទៅម៉ាស៊ីនមេឡើយ។
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium px-4 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            យល់ព្រម (Got it)
          </button>
        </div>
      </div>
    </div>
  );
}
