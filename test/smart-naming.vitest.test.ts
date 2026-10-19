import { describe, it, expect } from "vitest";
import {
  sanitizeFilenameStem,
  generateUpscaleSmartName,
  generateBgRemoverSmartName,
} from "../src/lib/smart-naming";

describe("Smart Naming & Stem Sanitization Engine", () => {
  it("sanitizes messy screenshot and camera timestamps while preserving meaningful names", () => {
    expect(sanitizeFilenameStem("Screenshot_2026-10-19_123456.png")).toBe("screenshot");
    expect(sanitizeFilenameStem("Screen Shot 2026-10-19 at 12.34.56 PM.png")).toBe("screenshot");
    expect(sanitizeFilenameStem("IMG_20261019_12345678.jpg")).toBe("img");
    expect(sanitizeFilenameStem("egg_photo_1729329482938.webp")).toBe("egg-photo");
    expect(sanitizeFilenameStem("my-document_scan.png")).toBe("my-document-scan");
  });

  it("safely preserves Khmer Unicode glyphs and English names", () => {
    const khmerName = "រូបថត_ស៊ុត_egg.png";
    const sanitized = sanitizeFilenameStem(khmerName);
    expect(sanitized).toContain("រូបថត-ស៊ុត-egg");
  });

  it("handles empty or null input gracefully", () => {
    expect(sanitizeFilenameStem(null)).toBe("image");
    expect(sanitizeFilenameStem("")).toBe("image");
    expect(sanitizeFilenameStem("....")).toBe("image");
  });

  it("generates descriptive smart names for Module 03 (Image Enhancer)", () => {
    // 3D Object
    const name3d = generateUpscaleSmartName({
      originalName: "egg_icon.png",
      preset: "ultra",
      isSmoothObject: true,
      scale: 8,
      outputWidth: 696,
      outputHeight: 720,
    });
    expect(name3d).toBe("plp-egg-icon-3d-object-8x-696x720");

    // Portrait
    const namePortrait = generateUpscaleSmartName({
      originalName: "avatar.jpg",
      preset: "portrait",
      skinToneRatio: 0.15,
      scale: 4,
      outputWidth: 1024,
      outputHeight: 1024,
    });
    expect(namePortrait).toBe("plp-avatar-portrait-hd-4x-1024x1024");

    // Document / Khmer Text
    const nameDoc = generateUpscaleSmartName({
      originalName: "khmer_grade12_math.png",
      preset: "text",
      isDocument: true,
      scale: 4,
      outputWidth: 1600,
      outputHeight: 2200,
    });
    expect(nameDoc).toBe("plp-khmer-grade12-math-khmer-doc-4x-1600x2200");
  });

  it("generates descriptive smart names for Module 02 (BG Remover)", () => {
    const nameTransparent = generateBgRemoverSmartName({
      originalName: "profile_student.jpg",
      channel: "transparent",
      width: 800,
      height: 1000,
    });
    expect(nameTransparent).toBe("plp-profile-student-transparent-800x1000");

    const nameWhite = generateBgRemoverSmartName({
      originalName: "formula_exercise.png",
      channel: "white",
      width: 1200,
      height: 600,
    });
    expect(nameWhite).toBe("plp-formula-exercise-question-white-1200x600");

    const namePink = generateBgRemoverSmartName({
      originalName: "exercise_answer.png",
      channel: "pink",
      width: 1200,
      height: 600,
    });
    expect(namePink).toBe("plp-exercise-answer-solution-pink-1200x600");
  });
});
