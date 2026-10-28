import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("SECURITY VECTOR 1 — Zero Secret Leakage Regression Test", () => {
  const srcDir = path.resolve(__dirname, "../src");
  const publicDir = path.resolve(__dirname, "../public");

  function getFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        getFiles(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it("1. Zero sensitive NEXT_PUBLIC_ variables exist anywhere in src/", () => {
    const srcFiles = getFiles(srcDir).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
    const violations: { file: string; line: string }[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("NEXT_PUBLIC_")) {
          // If any NEXT_PUBLIC_ is found, check if it's sensitive
          if (
            /NEXT_PUBLIC_.*(SECRET|TOKEN|KEY|PASS|AUTH|REDIS|VAULT|ADMIN)/i.test(lines[i]) ||
            lines[i].includes("NEXT_PUBLIC_HF_UPSCALE_URL")
          ) {
            violations.push({ file: path.relative(srcDir, file), line: lines[i].trim() });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("2. Client components ('use client') never import server-only or env.server", () => {
    const srcFiles = getFiles(srcDir).filter((f) => /\.(ts|tsx)$/.test(f));
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const isClientComponent = content.includes('"use client"') || content.includes("'use client'");
      if (isClientComponent) {
        if (
          content.includes("env.server") ||
          content.includes('"server-only"') ||
          content.includes("'server-only'") ||
          content.includes("process.env.APP_GATE_SESSION_SECRET") ||
          content.includes("process.env.UPSTASH_REDIS_REST_TOKEN") ||
          content.includes("process.env.REPLICATE_API_TOKEN") ||
          content.includes("process.env.GEMINI_API_KEY") ||
          content.includes("process.env.APP_GATE_ADMIN_RECOVERY_KEY")
        ) {
          violations.push(path.relative(srcDir, file));
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("3. No secrets or credential files stored under public/", () => {
    const publicFiles = getFiles(publicDir);
    const violations: string[] = [];

    for (const file of publicFiles) {
      const base = path.basename(file).toLowerCase();
      if (
        base.endsWith(".env") ||
        base.endsWith(".pem") ||
        base.endsWith(".key") ||
        base.includes("secret") ||
        base.includes("credential")
      ) {
        violations.push(path.relative(publicDir, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it("4. No static predictable fallback secret strings exist in source files", () => {
    const srcFiles = getFiles(srcDir).filter((f) => /\.(ts|tsx)$/.test(f));
    const bannedPatterns = [
      "0123456789abcdef0123456789abcdef",
      "dyt-plp-managed-credentials-vault-2026-safe-key",
      "dyt-plp-google-drive-oauth-token-vault-key-2026",
    ];

    const violations: { file: string; pattern: string }[] = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const pat of bannedPatterns) {
        if (content.includes(pat)) {
          violations.push({ file: path.relative(srcDir, file), pattern: pat });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("5. Production secret validator fails safely when required secrets are missing", async () => {
    const { getServerSecret } = await import("@/lib/env.server");
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      expect(() => {
        getServerSecret("NON_EXISTENT_MANDATORY_PRODUCTION_SECRET", true);
      }).toThrow(/CRITICAL: Required production secret/);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  });
});
