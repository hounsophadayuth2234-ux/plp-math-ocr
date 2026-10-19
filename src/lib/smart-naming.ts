/**
 * Smart Auto-Naming & Sanitization Engine
 * Shared between Module 02 (កាត់រូបភាព / BG Remover) and Module 03 (ធ្វើរូបឱ្យច្បាស់ / Image Enhancer).
 * Generates human-readable, descriptive, clean filenames and supports safe user editing.
 */

/**
 * Sanitizes an image stem by stripping camera/screenshot timestamps,
 * messy prefixes, and invalid characters while preserving Khmer Unicode and English text.
 */
export function sanitizeFilenameStem(rawName?: string | null): string {
  if (!rawName) return "image";

  // Remove file extension (e.g. .png, .jpg, .jpeg, .webp, .svg, .avif)
  let stem = rawName.replace(/\.[a-zA-Z0-9]+$/i, "").trim();

  // Strip common noisy screenshot / camera prefixes:
  // e.g. "Screenshot_2026-10-19_123456", "Screen Shot 2026-10-19 at 12.34.56 PM", "IMG_20261019_...", "PXL_..."
  stem = stem
    .replace(/^(screenshot|screen\s*shot)[_\s-]*(20\d{2}[-_]?\d{2}[-_]?\d{2}.*)?$/i, "screenshot")
    .replace(/^(img|image|pxl|dsc|photo)[_\s-]*(20\d{2}[-_]?\d{2}[-_]?\d{2}.*)?$/i, "$1")
    .replace(/^[\-_]+|[\-_]+$/g, "");

  // Remove timestamp suffixes (e.g., "_1729329482938" or "-2026-10-19")
  stem = stem.replace(/[-_]?(20\d{2}[-_]\d{2}[-_]\d{2}|\d{10,13})$/, "");

  // Replace invalid filesystem characters (\ / : * ? " < > |), underscores, and multiple spaces/dots with hyphens
  // Allow Khmer Unicode (\u1780-\u17FF), English alphanumeric, and hyphens
  stem = stem
    .replace(/[\\/:*?"<>|._]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!stem || stem.length === 0) {
    return "image";
  }

  // Max length cap at 45 characters for clean usability
  if (stem.length > 45) {
    stem = stem.slice(0, 45).replace(/-+$/, "");
  }

  return stem.toLowerCase();
}

export interface UpscaleNamingOptions {
  originalName?: string | null;
  preset?: string;
  isSmoothObject?: boolean;
  isDocument?: boolean;
  skinToneRatio?: number;
  scale?: number;
  outputWidth?: number;
  outputHeight?: number;
}

/**
 * Generates smart auto-name for Module 03 (Image Enhancer & Super-Resolution Studio)
 * Example outputs:
 *  - "plp-egg-3d-object-8x-696x720"
 *  - "plp-portrait-hd-4x-2048x2048"
 *  - "plp-khmer-doc-4x-1200x1600"
 */
export function generateUpscaleSmartName(opts: UpscaleNamingOptions): string {
  const stem = sanitizeFilenameStem(opts.originalName);

  let categoryTag = "enhanced";
  if (opts.isSmoothObject) {
    categoryTag = "3d-object";
  } else if ((opts.skinToneRatio ?? 0) >= 0.08 || opts.preset === "portrait") {
    categoryTag = "portrait-hd";
  } else if (opts.isDocument || opts.preset === "text") {
    categoryTag = "khmer-doc";
  } else if (opts.preset === "restore") {
    categoryTag = "restore";
  } else if (opts.scale === 8) {
    categoryTag = "micro-hd";
  }

  const scaleTag = opts.scale ? `${opts.scale}x` : "hd";
  const dimTag =
    opts.outputWidth && opts.outputHeight
      ? `${opts.outputWidth}x${opts.outputHeight}`
      : "";

  const isGenericStem = ["image", "screenshot", "img", "photo", "sample", "input"].includes(stem);

  const parts = ["plp"];
  if (!isGenericStem) {
    parts.push(stem);
  }
  parts.push(categoryTag);
  parts.push(scaleTag);
  if (dimTag) {
    parts.push(dimTag);
  }

  return parts.join("-");
}

export interface BgRemoverNamingOptions {
  originalName?: string | null;
  channel?: "transparent" | "white" | "pink" | "custom" | "mask";
  mode?: string;
  width?: number;
  height?: number;
}

/**
 * Generates smart auto-name for Module 02 (កាត់រូបភាព / Background Remover Studio)
 * Example outputs:
 *  - "plp-student-cutout-transparent"
 *  - "plp-math-formula-question-white"
 *  - "plp-problem-solution-pink"
 */
export function generateBgRemoverSmartName(opts: BgRemoverNamingOptions): string {
  const stem = sanitizeFilenameStem(opts.originalName);
  const isGenericStem = ["image", "screenshot", "img", "photo", "sample", "input"].includes(stem);

  let channelTag = "cutout";
  switch (opts.channel) {
    case "transparent":
      channelTag = "transparent";
      break;
    case "white":
      channelTag = "question-white";
      break;
    case "pink":
      channelTag = "solution-pink";
      break;
    case "custom":
      channelTag = "custom-bg";
      break;
    case "mask":
      channelTag = "alpha-mask";
      break;
    default:
      channelTag = "cutout";
  }

  const parts = ["plp"];
  if (!isGenericStem) {
    parts.push(stem);
  }
  parts.push(channelTag);

  if (opts.width && opts.height) {
    parts.push(`${opts.width}x${opts.height}`);
  }

  return parts.join("-");
}
