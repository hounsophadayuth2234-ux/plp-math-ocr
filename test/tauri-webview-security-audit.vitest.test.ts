import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Tauri WebView Online Features & Security Audit", () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
  const capPath = path.join(rootDir, "src-tauri", "capabilities", "default.json");

  it("verifies CSP explicitly authorizes Google OAuth & Identity Services", () => {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const csp: string = config.app?.security?.csp || "";

    // Google Identity / OAuth scripts
    expect(csp).toContain("https://accounts.google.com");
    expect(csp).toContain("https://apis.google.com");

    // OAuth Frame embedding / redirects
    expect(csp).toContain("frame-src");
    expect(csp).toMatch(/frame-src[^;]*https:\/\/accounts\.google\.com/);

    // OAuth Connect endpoints
    expect(csp).toMatch(/connect-src[^;]*https:\/\/accounts\.google\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/oauth2\.googleapis\.com/);
  });

  it("verifies CSP explicitly authorizes Google Drive Cloud Image Saving & Uploads", () => {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const csp: string = config.app?.security?.csp || "";

    // Google Drive v3 REST & Upload API
    expect(csp).toMatch(/connect-src[^;]*https:\/\/www\.googleapis\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.googleapis\.com/);

    // Google Drive image preview sources
    expect(csp).toMatch(/img-src[^;]*https:\/\/\*\.drive\.google\.com/);
  });

  it("verifies CSP authorizes Profile Avatars & Third-Party Auth Providers", () => {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const csp: string = config.app?.security?.csp || "";

    // User profile avatar images from Google, GitHub, and Telegram
    expect(csp).toContain("https://*.googleusercontent.com");
    expect(csp).toContain("https://*.githubusercontent.com");
    expect(csp).toContain("https://*.telegram.org");

    // Telegram Login Widget
    expect(csp).toContain("https://telegram.org");
    expect(csp).toContain("https://oauth.telegram.org");
  });

  it("verifies capabilities allow remote OAuth navigation without arbitrary shell grants", () => {
    const raw = fs.readFileSync(capPath, "utf-8");
    const cap = JSON.parse(raw);

    expect(cap.remote?.urls).toContain("https://math.dytcore.com/*");
    expect(cap.remote?.urls).toContain("https://accounts.google.com/*");
    expect(cap.remote?.urls).toContain("https://oauth.telegram.org/*");

    // Must retain least-privilege security
    expect(cap.permissions).not.toContain("shell:allow-all");
    expect(cap.permissions).not.toContain("fs:allow-all");
  });

  it("verifies zero universal wildcards in CSP sensitive directives", () => {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const csp: string = config.app?.security?.csp || "";

    expect(csp).not.toMatch(/default-src\s+[^;]*\*/);
    expect(csp).not.toMatch(/connect-src\s+[^;]*\s\*\s/);
    expect(csp).not.toMatch(/script-src\s+[^;]*\s\*\s/);
  });
});

