import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Tauri v2 Hybrid Android Foundation & Safety Verification", () => {
  const rootDir = process.cwd();

  describe("1. Tauri v2 Configuration Invariants (tauri.conf.json)", () => {
    const configPath = path.join(rootDir, "src-tauri", "tauri.conf.json");

    it("tauri.conf.json exists and parses as valid JSON", () => {
      expect(fs.existsSync(configPath)).toBe(true);
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      expect(config).toBeDefined();
    });

    it("configures exact app identity, version, and schema", () => {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.$schema).toBe("https://schema.tauri.app/config/2");
      expect(config.productName).toBe("PLP Math Content");
      expect(config.version).toBe("0.1.0");
      expect(config.identifier).toBe("com.dytcore.plpmath");
    });

    it("configures frontend build contract without breaking Next.js server", () => {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.build.frontendDist).toBe("../tauri-dist");
      expect(config.build.beforeBuildCommand).toBe("npm run build:tauri-entry");
      expect(config.build.devUrl).toBe("http://localhost:3000");
    });

    it("enforces strict CSP with zero wildcard all-origin grants", () => {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const csp = config.app?.security?.csp;
      expect(csp).toBeDefined();
      expect(csp).toContain("https://math.dytcore.com");
      expect(csp).not.toContain("default-src *");
      expect(csp).not.toContain("connect-src *");
      expect(csp).not.toContain("script-src *");
    });

    it("configures Android SDK targets with minSdkVersion >= 24", () => {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.bundle?.android?.minSdkVersion).toBeGreaterThanOrEqual(24);
      expect(config.bundle?.android?.targetSdkVersion).toBe(34);
    });
  });

  describe("2. Rust & Cargo Project Invariants", () => {
    it("Cargo.toml specifies mobile cdylib/staticlib targets and Tauri v2 dependencies", () => {
      const cargoPath = path.join(rootDir, "src-tauri", "Cargo.toml");
      expect(fs.existsSync(cargoPath)).toBe(true);
      const cargo = fs.readFileSync(cargoPath, "utf-8");
      expect(cargo).toContain("name = \"plp-math-hybrid\"");
      expect(cargo).toContain("crate-type = [\"staticlib\", \"cdylib\", \"rlib\"]");
      expect(cargo).toContain("tauri = { version = \"2\"");
      expect(cargo).toContain("tauri-build = { version = \"2\"");
    });

    it("Rust mobile entry point exists with valid syntax", () => {
      const libRsPath = path.join(rootDir, "src-tauri", "src", "lib.rs");
      const mainRsPath = path.join(rootDir, "src-tauri", "src", "main.rs");
      const buildRsPath = path.join(rootDir, "src-tauri", "build.rs");
      expect(fs.existsSync(libRsPath)).toBe(true);
      expect(fs.existsSync(mainRsPath)).toBe(true);
      expect(fs.existsSync(buildRsPath)).toBe(true);

      const libRs = fs.readFileSync(libRsPath, "utf-8");
      expect(libRs).toContain("#[cfg_attr(mobile, tauri::mobile_entry_point)]");
      expect(libRs).toContain("tauri::Builder::default()");
    });

    it("Tauri capabilities enforce least-privilege without arbitrary shell/fs access", () => {
      const capPath = path.join(rootDir, "src-tauri", "capabilities", "default.json");
      expect(fs.existsSync(capPath)).toBe(true);
      const cap = JSON.parse(fs.readFileSync(capPath, "utf-8"));
      expect(cap.permissions).toContain("core:default");
      expect(cap.permissions).not.toContain("shell:allow-all");
      expect(cap.permissions).not.toContain("fs:allow-all");
    });

    it("Tauri icons exist with all required dimensions", () => {
      const iconsDir = path.join(rootDir, "src-tauri", "icons");
      expect(fs.existsSync(path.join(iconsDir, "icon.png"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "32x32.png"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "128x128.png"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "128x128@2x.png"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "icon.ico"))).toBe(true);
    });
  });

  describe("3. Frontend Shell & Zero Secrets Verification", () => {
    const shellHtmlPath = path.join(rootDir, "src", "tauri-shell", "index.html");
    const distHtmlPath = path.join(rootDir, "tauri-dist", "index.html");

    it("source shell entry exists and contains required UI and diagnostics elements", () => {
      expect(fs.existsSync(shellHtmlPath)).toBe(true);
      const html = fs.readFileSync(shellHtmlPath, "utf-8");

      // Required UI elements
      expect(html).toContain("PLP Math Content");
      expect(html).toContain("Backend Connection");
      expect(html).toContain("System Diagnostics");
      expect(html).toContain("Launch PLP Math Hub");
      expect(html).toContain("Account Login / SSO");
      expect(html).toContain("Network Unavailable");
      expect(html).toContain("Retry Backend Probe");

      // Required diagnostic attributes
      expect(html).toContain("Tauri Shell Detected");
      expect(html).toContain("Frontend Entry");
      expect(html).toContain("Backend Target");
      expect(html).toContain("Network Reachability");
      expect(html).toContain("Round-trip Latency");
      expect(html).toContain("Platform Detected");
      expect(html).toContain("App Identifier");
      expect(html).toContain("https://math.dytcore.com");
    });

    it("build:tauri-entry produces valid tauri-dist/index.html", () => {
      expect(fs.existsSync(distHtmlPath)).toBe(true);
      const dist = fs.readFileSync(distHtmlPath, "utf-8");
      expect(dist.length).toBeGreaterThan(500);
      expect(dist).toContain("PLP Math Content");
    });

    it("verifies ZERO server secrets or private credentials are in the client bundle", () => {
      const dist = fs.readFileSync(distHtmlPath, "utf-8");
      const forbiddenTokens = [
        "UPSTASH_REDIS_REST_URL",
        "KV_REST_API_URL",
        "APP_GATE_SESSION_SECRET",
        "ADMIN_RECOVERY_KEY",
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        "REPLICATE_API_TOKEN",
        "JWT_SECRET",
        "PRIVATE_KEY",
        "passwordHash",
      ];

      for (const token of forbiddenTokens) {
        expect(dist).not.toContain(token);
      }
    });
  });

  describe("4. Preservation of Existing Next.js Production Web Application", () => {
    it("preserves next.config.ts without forcing static export", () => {
      const nextConfigPath = path.join(rootDir, "next.config.ts");
      const content = fs.readFileSync(nextConfigPath, "utf-8");
      expect(content).not.toContain("output: 'export'");
      expect(content).not.toContain("output: \"export\"");
      expect(content).toContain("cacheComponents: true");
      expect(content).toContain("partialPrefetching: true");
    });

    it("preserves all critical web routes", () => {
      const routes = [
        "src/app/page.tsx",
        "src/app/bg-remover/page.tsx",
        "src/app/image-upscaler/page.tsx",
        "src/app/math-solver/page.tsx",
        "src/app/plp-math-content/page.tsx",
        "src/app/login/page.tsx",
        "src/app/admin/page.tsx",
      ];

      for (const route of routes) {
        expect(fs.existsSync(path.join(rootDir, route))).toBe(true);
      }
    });

    it("preserves Module 02 BiRefNet FP16 worker and compositing pipeline", () => {
      const workerPath = path.join(rootDir, "src", "workers", "bg-remover.worker.ts");
      expect(fs.existsSync(workerPath)).toBe(true);
      const worker = fs.readFileSync(workerPath, "utf-8");
      expect(worker).toContain("onnx-community/BiRefNet_lite-ONNX");
      expect(worker).toContain("model_fp16.onnx");
      expect(worker).toContain("detectDominantBackgroundColor");
    });

    it("preserves Module 03 HD Enhancer worker and alpha preservation", () => {
      const workerPath = path.join(rootDir, "src", "workers", "hd-enhancer.worker.ts");
      const onnxConfigPath = path.join(rootDir, "src", "lib", "onnx-super-resolution.ts");
      expect(fs.existsSync(workerPath)).toBe(true);
      expect(fs.existsSync(onnxConfigPath)).toBe(true);
      const worker = fs.readFileSync(workerPath, "utf-8");
      const onnxConfig = fs.readFileSync(onnxConfigPath, "utf-8");
      expect(onnxConfig).toContain("realesr-general-x4v3.onnx");
      expect(worker).toContain("srcAlpha");
    });

    it("preserves server authentication, RBAC, and rate limiting engines", () => {
      const authFiles = [
        "src/lib/auth-session.ts",
        "src/lib/auth-gate.ts",
        "src/lib/rate-limiter.ts",
        "src/lib/user-store.ts",
        "src/app/api/auth/login/route.ts",
        "src/app/api/auth/gate/route.ts",
      ];

      for (const file of authFiles) {
        expect(fs.existsSync(path.join(rootDir, file))).toBe(true);
      }
    });
  });

  describe("5. GitHub Actions Workflows Validation", () => {
    it("validates web CI workflow exists and tests all web gates", () => {
      const ciPath = path.join(rootDir, ".github", "workflows", "ci.yml");
      expect(fs.existsSync(ciPath)).toBe(true);
      const ci = fs.readFileSync(ciPath, "utf-8");
      expect(ci).toContain("npm run lint");
      expect(ci).toContain("npx tsc --noEmit");
      expect(ci).toContain("npm test");
      expect(ci).toContain("npm run build:tauri-entry");
      expect(ci).toContain("npm run build");
    });

    it("validates Android Tauri Build workflow specifies pinned tools and artifact upload", () => {
      const androidCiPath = path.join(rootDir, ".github", "workflows", "android-tauri-build.yml");
      expect(fs.existsSync(androidCiPath)).toBe(true);
      const androidCi = fs.readFileSync(androidCiPath, "utf-8");
      expect(androidCi).toContain("actions/setup-java@v4");
      expect(androidCi).toContain("java-version: '21'");
      expect(androidCi).toContain("dtolnay/rust-toolchain@stable");
      expect(androidCi).toContain("aarch64-linux-android");
      expect(androidCi).toContain("ndk;27.1.12297006");
      expect(androidCi).toContain("npx tauri android init --ci");
      expect(androidCi).toContain("npx tauri android build --apk --ci --debug --target aarch64");
      expect(androidCi).toContain("actions/upload-artifact@v4");
      expect(androidCi).toContain("plp-math-hybrid-android-debug-apk");
    });
  });
});
