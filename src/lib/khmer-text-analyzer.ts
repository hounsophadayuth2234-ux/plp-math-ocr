/**
 * Khmer Text & Unicode Feature Analysis, Diacritic Protection, and Auto-Quality Resolution Module
 *
 * Provides comprehensive classification of Khmer Unicode characters:
 * - 33 Consonants (ព្យញ្ជនៈ)
 * - Independent Vowels (ស្រៈពេញតួ)
 * - Dependent Vowels (ស្រៈនិស្ស័យ) including Upper & Lower vowels
 * - Diacritics (វណ្ណយុត្តិ) including Nikahit, Reahmuk, Muusikatoan, Triisap, Bantoc, Robat, etc.
 * - Coeng (ជើង / Subscript sign U+17D2)
 *
 * Implements Auto-quality resolution fallback rules:
 * - Person + Text with normal text: 768px
 * - Person + Text with small/uncertain Khmer text: 1024px (Auto-upgraded to protect diacritics & coeng)
 * - Person-only / Product-only without text: 512px or 640px
 * - Document / Text: minimum 768px, preferably 1024px
 */

import { SelectionMode } from "./bg-compositor";

// ── Unicode Constants & RegEx for Khmer Script ──
export const KHMER_UNICODE = {
  CONSONANTS: /[\u1780-\u17A2]/g,
  INDEPENDENT_VOWELS: /[\u17A3-\u17B3]/g,
  UPPER_VOWELS: /[\u17B7-\u17BA\u17BE\u17C1-\u17C5]/g,
  LOWER_VOWELS: /[\u17BB-\u17BD]/g,
  COENG: /\u17D2/g,
  DIACRITICS: /[\u17C6-\u17D1\u17D3]/g,
  DIGITS: /[\u17E0-\u17E9]/g,
  SYMBOLS: /[\u17D4-\u17DA\u17DC-\u17DD]/g,
  ALL_KHMER: /[\u1780-\u17FF\u19E0-\u19FF]/g,
};

export type KhmerGlyphCategory =
  | "consonant"
  | "independent_vowel"
  | "upper_vowel"
  | "lower_vowel"
  | "coeng"
  | "diacritic"
  | "digit"
  | "symbol"
  | "latin"
  | "other";

/**
 * Classifies a single character into its linguistic/Unicode category.
 */
export function classifyGlyph(char: string): KhmerGlyphCategory {
  if (!char || char.length === 0) return "other";
  const code = char.codePointAt(0) || 0;

  if (code >= 0x1780 && code <= 0x17a2) return "consonant";
  if (code >= 0x17a3 && code <= 0x17b3) return "independent_vowel";
  if (code === 0x17d2) return "coeng";
  // Upper vowels
  if (
    (code >= 0x17b7 && code <= 0x17ba) ||
    code === 0x17be ||
    (code >= 0x17c1 && code <= 0x17c5)
  ) {
    return "upper_vowel";
  }
  // Lower vowels
  if (code >= 0x17bb && code <= 0x17bd) return "lower_vowel";
  // Diacritics
  if ((code >= 0x17c6 && code <= 0x17d1) || code === 0x17d3) return "diacritic";
  if (code >= 0x17e0 && code <= 0x17e9) return "digit";
  if ((code >= 0x17d4 && code <= 0x17da) || (code >= 0x17dc && code <= 0x17dd)) return "symbol";
  if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) return "latin";

  return "other";
}

export interface KhmerStringAnalysis {
  hasKhmer: boolean;
  totalChars: number;
  consonantsCount: number;
  upperVowelsCount: number;
  lowerVowelsCount: number;
  coengCount: number;
  diacriticsCount: number;
  latinCount: number;
  hasMixedScript: boolean;
  hasSmallSubscripts: boolean;
  hasStackedDiacritics: boolean;
}

/**
 * Parses and analyzes a string containing Khmer text, diacritics, and mixed Latin.
 */
export function analyzeKhmerTextString(text: string): KhmerStringAnalysis {
  let consonants = 0;
  let upperVowels = 0;
  let lowerVowels = 0;
  let coeng = 0;
  let diacritics = 0;
  let latin = 0;

  for (const ch of text) {
    const cat = classifyGlyph(ch);
    if (cat === "consonant") consonants++;
    else if (cat === "upper_vowel") upperVowels++;
    else if (cat === "lower_vowel") lowerVowels++;
    else if (cat === "coeng") coeng++;
    else if (cat === "diacritic") diacritics++;
    else if (cat === "latin") latin++;
  }

  const khmerCount = consonants + upperVowels + lowerVowels + coeng + diacritics;
  const hasKhmer = khmerCount > 0;

  return {
    hasKhmer,
    totalChars: text.length,
    consonantsCount: consonants,
    upperVowelsCount: upperVowels,
    lowerVowelsCount: lowerVowels,
    coengCount: coeng,
    diacriticsCount: diacritics,
    latinCount: latin,
    hasMixedScript: hasKhmer && latin > 0,
    hasSmallSubscripts: coeng > 0 || lowerVowels > 0,
    hasStackedDiacritics: upperVowels > 0 || diacritics > 0,
  };
}

export interface KhmerImageFeatures {
  hasTextStrokes: boolean;
  hasSmallKhmerText: boolean;
  hasDiacriticClusters: boolean;
  hasSubscriptStacks: boolean;
  textNearPersonSilhouette: boolean;
  textComponentCount: number;
  smallComponentCount: number;
  recommendedResolution: 512 | 640 | 768 | 1024;
  confidence: "high" | "uncertain";
  autoQualityTriggered: boolean;
  reason: string;
}

/**
 * Analyzes image pixels and connected stroke components for Khmer typographical features:
 * - Multi-tier vertical stacks (upper vowel 1-3px above consonant, subscript below consonant)
 * - Small disconnected stroke islands (area < 80px, height < 12px)
 * - Proximity of text strokes to person hair or shoulder boundary
 */
export function detectKhmerImageTypographicalFeatures(
  textStrokeMask: Uint8ClampedArray | Uint8Array,
  personMask: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number
): KhmerImageFeatures {
  const totalPixels = width * height;
  let textPixels = 0;
  let smallIslandCount = 0;
  let textNearPerson = false;

  // Connected component analysis on text strokes
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);

  interface StrokeIsland {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    area: number;
    height: number;
    width: number;
  }
  const islands: StrokeIsland[] = [];

  for (let y = 1; y < height - 1; y++) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOff + x;
      if (textStrokeMask[idx] === 0 || visited[idx] === 1) continue;

      let qHead = 0, qTail = 0;
      queue[qTail++] = idx;
      visited[idx] = 1;

      let area = 0;
      let minX = x, maxX = x, minY = y, maxY = y;

      while (qHead < qTail) {
        const curr = queue[qHead++];
        area++;
        const cx = curr % width;
        const cy = Math.floor(curr / width);

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // Check proximity to person silhouette (within 4 pixels)
        if (personMask && !textNearPerson) {
          for (let dy = -3; dy <= 3; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -3; dx <= 3; dx++) {
              const nx = cx + dx;
              if (nx < 0 || nx >= width) continue;
              if (personMask[ny * width + nx] > 128) {
                textNearPerson = true;
                break;
              }
            }
            if (textNearPerson) break;
          }
        }

        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1,
          cy > 0 ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && textStrokeMask[n] > 0 && visited[n] === 0) {
            visited[n] = 1;
            queue[qTail++] = n;
          }
        }
      }

      textPixels += area;
      const compH = maxY - minY + 1;
      const compW = maxX - minX + 1;

      // Small island characteristic of Khmer diacritics / upper vowels or subscripts
      if (area <= 95 && area >= 2 && compH <= 14) {
        smallIslandCount++;
      }

      islands.push({ minX, maxX, minY, maxY, area, height: compH, width: compW });
    }
  }

  // Detect vertical stacking of strokes (characteristic of Khmer consonant + subscript or diacritic)
  let verticalStackCount = 0;
  for (let i = 0; i < islands.length; i++) {
    const a = islands[i];
    for (let j = i + 1; j < Math.min(islands.length, i + 15); j++) {
      const b = islands[j];
      // Horizontal overlap
      const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      if (xOverlap > 3) {
        // Vertical gap
        const yGap = Math.abs(b.minY - a.maxY);
        if (yGap >= 0 && yGap <= 8) {
          verticalStackCount++;
        }
      }
    }
  }

  const hasSmallKhmerText = smallIslandCount >= 6 || (smallIslandCount >= 2 && verticalStackCount >= 2);
  const hasDiacriticClusters = smallIslandCount >= 4;
  const hasSubscriptStacks = verticalStackCount >= 2;
  const hasTextStrokes = textPixels > 30;

  // Determine auto-quality resolution
  let recommendedResolution: 512 | 640 | 768 | 1024 = 768;
  let autoQualityTriggered = false;
  let reason = "Normal text detected; 768px provides sharp strokes.";
  let confidence: "high" | "uncertain" = "high";

  if (!hasTextStrokes) {
    recommendedResolution = 640;
    reason = "No prominent text detected; 640px Fast preview selected.";
  } else if (hasSmallKhmerText || smallIslandCount > 15 || verticalStackCount > 5) {
    recommendedResolution = 1024;
    autoQualityTriggered = true;
    confidence = "uncertain";
    reason = `Detected ${smallIslandCount} small Khmer stroke islands and ${verticalStackCount} vertical stacks. Auto-upgraded to 1024px to prevent stroke loss.`;
  }

  return {
    hasTextStrokes,
    hasSmallKhmerText,
    hasDiacriticClusters,
    hasSubscriptStacks,
    textNearPersonSilhouette: textNearPerson,
    textComponentCount: islands.length,
    smallComponentCount: smallIslandCount,
    recommendedResolution,
    confidence,
    autoQualityTriggered,
    reason,
  };
}

/**
 * Resolves the optimal working resolution using truthful auto-quality fallback logic.
 */
export function resolveAutoQualityWorkingResolution(params: {
  mode: SelectionMode;
  edgeQuality: "fast" | "balanced" | "fine_details" | "quality";
  hasSmallKhmerText?: boolean;
  textConfidence?: "high" | "uncertain";
  sourceWidth?: number;
  sourceHeight?: number;
}): {
  resolution: number;
  reason: string;
  fallbackTriggered: boolean;
} {
  const { mode, edgeQuality, hasSmallKhmerText, textConfidence } = params;

  // 1. Balanced or Fine profile: Always high-resolution
  if (edgeQuality === "fine_details") {
    return {
      resolution: 1536,
      reason: "Fine details profile: high-precision 1536px working resolution.",
      fallbackTriggered: false,
    };
  }
  if (edgeQuality === "balanced") {
    return {
      resolution: 1024,
      reason: "Balanced profile: standard 1024px working resolution.",
      fallbackTriggered: false,
    };
  }

  // 2. Document / Poster mode: Minimum 768px, preferably 1024px
  if (mode === "document_poster" || mode === "whole_poster" || mode === "document_text") {
    return {
      resolution: 1024,
      reason: "Document/Poster/Text mode: 1024px working resolution to preserve complete typography and boundary edges.",
      fallbackTriggered: false,
    };
  }

  // 3. Person-only / Product-only without text: 512px or 640px
  if (mode === "person" || mode === "person_only" || mode === "contents_only" || mode === "whole_product" || mode === "product_only") {
    return {
      resolution: 640,
      reason: "Person/Product-only mode without text: 640px Fast preview selected for sub-second speed.",
      fallbackTriggered: false,
    };
  }

  // 4. Person + Text mode:
  if (mode === "person_text_only" || mode === "person_plus_text") {
    if (hasSmallKhmerText || textConfidence === "uncertain") {
      return {
        resolution: 1024,
        reason: "Auto-quality fallback: Small or uncertain Khmer text detected. Upgraded from 768px to 1024px to protect vowels, subscripts, and diacritics.",
        fallbackTriggered: true,
      };
    }
    return {
      resolution: 768,
      reason: "Person + Text mode with standard text: 768px working resolution selected for high stroke recall.",
      fallbackTriggered: false,
    };
  }

  // 5. Default fallback
  return {
    resolution: 768,
    reason: "Standard 768px working resolution.",
    fallbackTriggered: false,
  };
}
