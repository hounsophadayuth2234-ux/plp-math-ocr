import { describe, it, expect, vi } from "vitest";
import {
  requiresTextDetection,
  runRequiredTextDetection,
  TextRegion,
  combinePersonAndTextMasks,
} from "../src/lib/bg-removal-client";
import { chokeAndFeatherAlphaMask } from "../src/lib/bg-compositor";
import {
  analyzeKhmerTextString,
  detectKhmerImageTypographicalFeatures,
} from "../src/lib/khmer-text-analyzer";

describe("Person + Text Mandatory Text Detection & Protection Suite", () => {
  const dummyBlob = new Blob(["fake-image-bytes"], { type: "image/png" });

  it("1. person_text_only calls detectText", async () => {
    const mockDetectText = vi.fn(async (): Promise<TextRegion[]> => {
      return [
        {
          minX: 10,
          maxX: 100,
          minY: 10,
          maxY: 40,
          confidence: 0.98,
          lineType: "khmer",
        },
      ];
    });

    const result = await runRequiredTextDetection({
      keepMode: "person_text_only",
      image: dummyBlob,
      detectText: mockDetectText,
    });

    expect(mockDetectText).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(result.regions).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("2. person_text_only never returns skipped", async () => {
    // Check when detector succeeds
    const successResult = await runRequiredTextDetection({
      keepMode: "person_text_only",
      image: dummyBlob,
      detectText: async () => [],
    });
    expect(successResult.status).not.toBe("skipped");
    expect(successResult.status).toBe("completed");

    // Check when detector fails
    const failResult = await runRequiredTextDetection({
      keepMode: "person_text_only",
      image: dummyBlob,
      detectText: async () => {
        throw new Error("Simulated detector network/model crash");
      },
    });
    expect(failResult.status).not.toBe("skipped");
    expect(failResult.status).toBe("failed");
  });

  it("3. person_text_only retries after a detector failure", async () => {
    let callCount = 0;
    const mockDetectText = vi.fn(async (): Promise<TextRegion[]> => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Transient detector error");
      }
      return [
        {
          minX: 20,
          maxX: 80,
          minY: 20,
          maxY: 50,
          confidence: 0.95,
          lineType: "khmer",
        },
      ];
    });

    const result = await runRequiredTextDetection({
      keepMode: "person_text_only",
      image: dummyBlob,
      detectText: mockDetectText,
    });

    expect(mockDetectText).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("completed");
    expect(result.retryCount).toBe(1);
    expect(result.regions).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("4. A second detector failure produces Required but failed", async () => {
    const mockDetectText = vi.fn(async (): Promise<TextRegion[]> => {
      throw new Error("Persistent detector crash");
    });

    const result = await runRequiredTextDetection({
      keepMode: "person_text_only",
      image: dummyBlob,
      detectText: mockDetectText,
    });

    // 1 initial attempt + 1 retry = 2 attempts total
    expect(mockDetectText).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("Required but failed");
    expect(result.regions).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("5. person_only and product_only may return skipped with an explicit reason", async () => {
    const mockDetectText = vi.fn(async () => []);

    // Test person_only
    const personResult = await runRequiredTextDetection({
      keepMode: "person_only",
      image: dummyBlob,
      detectText: mockDetectText,
    });
    expect(mockDetectText).not.toHaveBeenCalled();
    expect(personResult.status).toBe("skipped");
    expect(personResult.durationMs).toBe(0);
    expect(personResult.reason).toContain("does not require text detection");

    // Test product_only
    const productResult = await runRequiredTextDetection({
      keepMode: "product_only",
      image: dummyBlob,
      detectText: mockDetectText,
    });
    expect(mockDetectText).not.toHaveBeenCalled();
    expect(productResult.status).toBe("skipped");
    expect(productResult.durationMs).toBe(0);
    expect(productResult.reason).toContain("does not require text detection");
  });

  it("6. textMask is not eroded using person-mask edge settings", () => {
    const w = 40;
    const h = 40;
    const total = w * h;

    const personMask = new Uint8ClampedArray(total);
    const textMask = new Uint8ClampedArray(total);

    // Person block: rectangle in middle [10..30, 10..30]
    for (let y = 10; y <= 30; y++) {
      for (let x = 10; x <= 30; x++) {
        personMask[y * w + x] = 255;
      }
    }

    // 1-pixel thin Khmer text stroke line across top [y=5, x=5..35]
    for (let x = 5; x <= 35; x++) {
      textMask[5 * w + x] = 255;
    }

    // Apply conservative choke to person mask ONLY
    const cleanedPersonMask = chokeAndFeatherAlphaMask(personMask, w, h, 1.5, 0.7);

    // Combine person and text masks
    const combined = combinePersonAndTextMasks(cleanedPersonMask, textMask, w, h, {
      keepPerson: true,
      keepText: true,
    });

    // 1. Verify that person edge WAS choked/feathered (outer boundary < 255)
    expect(cleanedPersonMask[10 * w + 10]).toBeLessThan(255);

    // 2. Verify that 1-pixel thin text stroke was NOT eroded and remains 100% intact (255)
    for (let x = 5; x <= 35; x++) {
      expect(combined.finalKeepMask[5 * w + x]).toBe(255);
    }
  });

  it("7. Khmer vowels, diacritics, coeng/subscripts, English text, and numbers remain protected", () => {
    // String containing Khmer consonants, upper vowels, lower vowels (ុ in មនុស្ស), coeng, diacritics, English, numbers
    const mixedKhmerText = "លំហាត់រូបភាពមនុស្ស និងគណិតវិទ្យាថ្នាក់ទី១២៖ Math Exam Grade 12 សមីការ ២ + ៣ = ៥";
    const analysis = analyzeKhmerTextString(mixedKhmerText);

    expect(analysis.hasKhmer).toBe(true);
    expect(analysis.consonantsCount).toBeGreaterThan(0);
    expect(analysis.upperVowelsCount).toBeGreaterThan(0); // ិ, ី
    expect(analysis.lowerVowelsCount).toBeGreaterThan(0); // ុ, ូ
    expect(analysis.coengCount).toBeGreaterThan(0); // ្
    expect(analysis.diacriticsCount).toBeGreaterThan(0); // ់, ័
    expect(analysis.latinCount).toBeGreaterThan(0); // "Math Exam Grade"
    expect(analysis.hasMixedScript).toBe(true);
    expect(analysis.hasSmallSubscripts).toBe(true);
    expect(analysis.hasStackedDiacritics).toBe(true);

    // Synthetic mask containing small islands (representing diacritics/subscripts)
    const w = 60;
    const h = 60;
    const strokeMask = new Uint8ClampedArray(w * h);

    // Create 8 small stroke islands (<80px each) representing diacritics and subscripts
    for (let i = 0; i < 8; i++) {
      const startX = 5 + i * 6;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          strokeMask[(10 + dy) * w + (startX + dx)] = 255;
        }
      }
    }

    const features = detectKhmerImageTypographicalFeatures(strokeMask, null, w, h);
    expect(features.hasTextStrokes).toBe(true);
    expect(features.hasSmallKhmerText).toBe(true);
    expect(features.hasDiacriticClusters).toBe(true);
    // When small Khmer diacritics/subscripts are present, auto-quality recommends 1024px
    expect(features.recommendedResolution).toBe(1024);
  });
});
