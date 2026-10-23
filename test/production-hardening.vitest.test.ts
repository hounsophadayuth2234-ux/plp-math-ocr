import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeKhmerPlainText, normalizeKhmerEducationalText } from "@/lib/khmer-text-normalizer";
import { normalizeQuizQuestions, QuizQuestion } from "@/lib/lesson-studio";
import {
  verifyMathResultDeterministically,
  evaluatePercentageOrGeometry,
  DISCREPANCY_ERROR_KHMER,
} from "@/lib/deterministic-math-verifier";
import {
  generateTotpSetup,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyAndConsumeRecoveryCode,
} from "@/lib/mfa";

describe("Production Hardening Pass Test Suite", () => {
  // =========================================================================
  // 1. Global Module Status Consistency
  // =========================================================================
  describe("1. Module Status Consistency", () => {
    it("should have zero stale 'Under Maintenance' references across src codebase", () => {
      const srcDir = path.join(process.cwd(), "src");

      function scanDir(dir: string): string[] {
        const files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...scanDir(fullPath));
          } else if (/\.(tsx?|jsx?|json)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const allFiles = scanDir(srcDir);
      const staleOccurrences: string[] = [];

      for (const file of allFiles) {
        const content = fs.readFileSync(file, "utf-8");
        if (content.includes("Module 05 Under Maintenance") || content.includes("Under Maintenance")) {
          staleOccurrences.push(file);
        }
      }

      expect(staleOccurrences).toEqual([]);
    });

    it("verifies Sidebar contains 'All 5 Modules Operational' and 'Module 01–05 Active'", () => {
      const sidebarPath = path.join(process.cwd(), "src", "components", "layout", "Sidebar.tsx");
      const content = fs.readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("All 5 Modules Operational");
      expect(content).toContain("Module 01–05 Active");
    });
  });

  // =========================================================================
  // 2. Khmer Typo and Language Quality
  // =========================================================================
  describe("2. Khmer Typo & Language Normalization", () => {
    it("corrects known educational typos like 'សមមីការ' -> 'សមីការ'", () => {
      const input = "ការដោះស្រាយសមមីការដឺក្រេទី១៖ ស្វែងរកតម្លៃ x";
      const cleaned = normalizeKhmerPlainText(input);
      expect(cleaned).toContain("សមីការ");
      expect(cleaned).not.toContain("សមមីការ");
    });

    it("removes accidental Thai script contamination without destroying Khmer", () => {
      const input = "ចូរដោះស្រាយសមមីការនេះ กำจัด ដោយប្រើប្រមាណវិធីបូក";
      const cleaned = normalizeKhmerPlainText(input);
      expect(cleaned).not.toContain("กำจัด");
      expect(cleaned).toContain("ចូរដោះស្រាយសមីការនេះ");
      expect(cleaned).toContain("ដោយប្រើប្រមាណវិធីបូក");
    });

    it("preserves HTML tags, LaTeX, MathML, and SVG unchanged", () => {
      const complexHtml = `<div class="solution-box"><p>សមមីការ <strong>$2x + 6 = 12$</strong></p><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg></div>`;
      const normalized = normalizeKhmerEducationalText(complexHtml);
      expect(normalized).toContain(`class="solution-box"`);
      expect(normalized).toContain(`$2x + 6 = 12$`);
      expect(normalized).toContain(`<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>`);
      expect(normalized).toContain("សមីការ");
      expect(normalized).not.toContain("សមមីការ");
    });
  });

  // =========================================================================
  // 3. Force Answer Options to use ក. ខ. គ. ឃ.
  // =========================================================================
  describe("3. Answer Option Normalization Layer (ក ខ គ ឃ)", () => {
    it("converts Latin A, B, C, D options to exactly ក. ខ. គ. ឃ.", () => {
      const rawQuestions: QuizQuestion[] = [
        {
          id: 1,
          type: "multiple_choice",
          question: "តើ 15 + 10 ស្មើនឹងប៉ុន្មាន?",
          options: ["A. 20", "B. 25", "C. 30", "D. 35"],
          answer: "B",
          explanation: "១៥ + ១០ = ២៥",
        },
      ];

      const normalized = normalizeQuizQuestions(rawQuestions);
      expect(normalized[0].options).toHaveLength(4);
      expect(normalized[0].options![0]).toBe("ក. 20");
      expect(normalized[0].options![1]).toBe("ខ. 25");
      expect(normalized[0].options![2]).toBe("គ. 30");
      expect(normalized[0].options![3]).toBe("ឃ. 35");
      expect(normalized[0].answer).toBe("ខ. 25");
    });

    it("corrects corrupt Khmer prefixes like ឆ. to ឃ. and enforces 4 options", () => {
      const rawQuestions: QuizQuestion[] = [
        {
          id: 2,
          type: "multiple_choice",
          question: "តើ 8 × 4 ស្មើនឹងប៉ុន្មាន?",
          options: ["ក. 24", "ខ. 28", "គ. 32", "ឆ. 36"],
          answer: "គ",
          explanation: "៨ × ៤ = ៣២",
        },
      ];

      const normalized = normalizeQuizQuestions(rawQuestions);
      expect(normalized[0].options![3].startsWith("ឃ.")).toBe(true);
      expect(normalized[0].options![3]).not.toContain("ឆ.");
      expect(normalized[0].answer.startsWith("គ.")).toBe(true);
    });

    it("augments questions with fewer than 4 options to strictly 4 options", () => {
      const rawQuestions: QuizQuestion[] = [
        {
          id: 3,
          type: "multiple_choice",
          question: "សំណួរគំរូ",
          options: ["ក. ជម្រើសទីមួយ", "ខ. ជម្រើសទីពីរ"],
          answer: "ក",
          explanation: "ពន្យល់",
        },
      ];

      const normalized = normalizeQuizQuestions(rawQuestions);
      expect(normalized[0].options).toHaveLength(4);
      expect(normalized[0].options![2].startsWith("គ.")).toBe(true);
      expect(normalized[0].options![3].startsWith("ឃ.")).toBe(true);
    });
  });

  // =========================================================================
  // 4. Deterministic Math Verifier
  // =========================================================================
  describe("4. Deterministic Math Verifier", () => {
    it("verifies basic arithmetic accurately", () => {
      const result = verifyMathResultDeterministically("៤៥ + ៣២", "៧៧");
      expect(result.isVerified).toBe(true);
      expect(result.status).toBe("verified");
      expect(result.computedAnswerKhmer).toBe("៧៧");
    });

    it("flags discrepancy when proposed answer does not match deterministic calculation", () => {
      const result = verifyMathResultDeterministically("៤៥ + ៣២", "៨០");
      expect(result.isVerified).toBe(false);
      expect(result.status).toBe("discrepancy");
      expect(result.reviewPoints).toContain(DISCREPANCY_ERROR_KHMER);
    });

    it("verifies fraction arithmetic with simplification", () => {
      const result = verifyMathResultDeterministically("1/4 + 1/4", "1/2");
      expect(result.isVerified).toBe(true);
      expect(result.status).toBe("verified");
    });

    it("verifies linear equation with substitution", () => {
      const result = verifyMathResultDeterministically("2x+6=12", "x=3");
      expect(result.isVerified).toBe(true);
      expect(result.status).toBe("verified");
    });

    it("verifies rectangle perimeter and area deterministically", () => {
      const geom = evaluatePercentageOrGeometry("គណនាផ្ទៃក្រឡាចតុកោណកែងដែលមាន បណ្ដោយ 8m និងទទឹង 5m");
      expect(geom.success).toBe(true);
      expect(geom.result).toBe(40);

      const perim = evaluatePercentageOrGeometry("គណនាបរិមាត្រចតុកោណកែង បណ្ដោយ 10 ទទឹង 4");
      expect(perim.success).toBe(true);
      expect(perim.result).toBe(28);
    });

    it("verifies percentages deterministically", () => {
      const pct = evaluatePercentageOrGeometry("គណនា 20% នៃ 150");
      expect(pct.success).toBe(true);
      expect(pct.result).toBe(30);
    });

    it("marks ambiguous word problems as 'unverifiable' requiring review instead of guessing", () => {
      const result = verifyMathResultDeterministically("សុខមានសៀវភៅ ៥ ក្បាល", "៥ ក្បាល");
      expect(result.status).toBe("unverifiable");
      expect(result.reviewPoints[0]).toContain("Requires review");
    });
  });

  // =========================================================================
  // 5. Admin MFA Engine (TOTP RFC 6238 & Recovery Codes)
  // =========================================================================
  describe("5. Admin MFA Engine", () => {
    it("generates valid TOTP setup with encrypted secret and SVG QR code", async () => {
      const setup = await generateTotpSetup("admin1");
      expect(setup.plainSecret).toHaveLength(32);
      expect(setup.encryptedSecret).toBeDefined();
      expect(setup.qrSvg).toContain("<svg");
      expect(setup.otpauthUrl).toContain("otpauth://totp/");
    });

    it("verifies a valid TOTP code generated from the secret", async () => {
      const setup = await generateTotpSetup("admin1");
      const { generateTotpCode, verifyTotpCode } = await import("@/lib/mfa");
      const currentCode = generateTotpCode(setup.plainSecret);

      const isValid = await verifyTotpCode(setup.encryptedSecret, currentCode);
      expect(isValid).toBe(true);
    });

    it("rejects an invalid TOTP code", async () => {
      const setup = await generateTotpSetup("admin1");
      const isValid = await verifyTotpCode(setup.encryptedSecret, "000000");
      expect(isValid).toBe(false);
    });

    it("generates, hashes, and consumes single-use recovery codes securely", async () => {
      const codes = generateRecoveryCodes(4);
      expect(codes).toHaveLength(4);
      const hashed = hashRecoveryCodes(codes);
      expect(hashed).toHaveLength(4);

      // Verify and consume the first code
      const result = await verifyAndConsumeRecoveryCode(hashed, codes[0]);
      expect(result.valid).toBe(true);
      expect(result.remainingHashedCodes).toHaveLength(3);

      // Attempting to reuse the consumed code should fail
      const reuseResult = await verifyAndConsumeRecoveryCode(result.remainingHashedCodes, codes[0]);
      expect(reuseResult.valid).toBe(false);
    });
  });

  // =========================================================================
  // 6. Security Headers & CORS Policy Invariants
  // =========================================================================
  describe("6. Security Headers & CORS Invariants", () => {
    it("verifies next.config.ts contains hardened CSP without unsafe-eval", () => {
      const configPath = path.join(process.cwd(), "next.config.ts");
      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("script-src 'self' 'wasm-unsafe-eval'");
      expect(content).not.toContain("script-src 'self' 'unsafe-eval'");
      expect(content).toContain("Permissions-Policy");
      expect(content).toContain("camera=(), microphone=()");
      expect(content).toContain("frame-ancestors 'none'");
    });

    it("verifies middleware.ts enforces official origin allowlist without wildcard CORS", () => {
      const mwPath = path.join(process.cwd(), "src", "middleware.ts");
      const content = fs.readFileSync(mwPath, "utf-8");
      expect(content).toContain("https://ai-toolkit-hub-nu.vercel.app");
      expect(content).not.toContain("Access-Control-Allow-Origin: *");
      expect(content).toContain("Vary");
    });
  });
});
