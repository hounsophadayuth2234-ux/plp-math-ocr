"use client";

import React from "react";
import { Sliders, Sparkles, FileText, Camera, Edit3, Sigma } from "lucide-react";
import { PreprocessProfile } from "@/lib/math-image-analyzer";

interface PreprocessProfileSelectorProps {
  selectedProfile: PreprocessProfile;
  onSelectProfile: (profile: PreprocessProfile) => void;
  disabled?: boolean;
}

const PROFILES: {
  id: PreprocessProfile;
  label: string;
  khmerLabel: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "printed_light_background",
    label: "Printed Document",
    khmerLabel: "ឯកសារបោះពុម្ព",
    desc: "Clean white background, sharp text",
    icon: FileText,
  },
  {
    id: "camera_document",
    label: "Camera Photo",
    khmerLabel: "រូបថតពីកាមេរ៉ា",
    desc: "Uneven document lighting, shadow leveling",
    icon: Camera,
  },
  {
    id: "handwriting",
    label: "Handwritten",
    khmerLabel: "គណិតវិទ្យាសរសេរដៃ",
    desc: "Pencil & pen stroke enhancement",
    icon: Edit3,
  },
  {
    id: "math_formula",
    label: "Math Formula",
    khmerLabel: "រូបមន្តគណិតវិទ្យា",
    desc: "Fractions, exponents & radical preservation",
    icon: Sigma,
  },
  {
    id: "mixed_khmer_math",
    label: "Khmer + Math",
    khmerLabel: "អក្សរខ្មែរ + គណិត",
    desc: "Khmer subscript stacks & math equations",
    icon: Sparkles,
  },
];

export function PreprocessProfileSelector({
  selectedProfile,
  onSelectProfile,
  disabled = false,
}: PreprocessProfileSelectorProps) {
  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="flex items-center justify-between pb-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5 text-cyan-400" />
          <span>Processing Profile // កម្រងកែសម្រួល</span>
        </label>
        <span className="text-[10px] text-slate-500 font-normal">
          Optimizes stroke fidelity
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PROFILES.map((p) => {
          const Icon = p.icon;
          const isSelected = selectedProfile === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectProfile(p.id)}
              className={`flex flex-col items-start p-2.5 rounded-none border text-left transition-all ${
                isSelected
                  ? "border-cyan-400 bg-cyan-950/70 text-white font-bold ring-1 ring-cyan-400/40"
                  : "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              } disabled:opacity-50 min-h-[44px]`}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-cyan-300" : "text-slate-500"}`} />
                <span className="text-[11px] font-bold truncate">{p.label}</span>
              </div>
              <span className="text-[9.5px] text-slate-500 mt-1 line-clamp-1 leading-tight">
                {p.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
