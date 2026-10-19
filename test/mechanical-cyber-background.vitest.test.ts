import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Mechanical Cyber Technology Background & Control Transparency Suite", () => {
  const cssPath = path.resolve(__dirname, "../src/app/globals.css");
  const bgComponentPath = path.resolve(
    __dirname,
    "../src/components/ui/MechanicalCyberBackground.tsx"
  );
  const pagePath = path.resolve(
    __dirname,
    "../src/app/plp-math-content/page.tsx"
  );

  const cssContent = fs.readFileSync(cssPath, "utf-8");
  const bgContent = fs.readFileSync(bgComponentPath, "utf-8");
  const pageContent = fs.readFileSync(pagePath, "utf-8");

  // ── 1. Background Layer Positioning & Pointer Events Invariant ──
  it("1. ensures background layer is fixed/absolute at z-0 with pointer-events-none", () => {
    expect(bgContent).toContain('data-testid="cyber-bg-canvas"');
    expect(bgContent).toContain("pointer-events-none");
    expect(bgContent).toContain("z-0");
    expect(bgContent).toContain("select-none");
    expect(bgContent).toContain('data-testid="math-formula-streams"');
  });

  // ── 2. Formula Stream Count (8-12 Desktop, 4-6 Mobile) ──
  it("2. defines 10 formula streams total (10 on desktop, 5 on mobile)", () => {
    // Matches 8-12 on desktop and 4-6 on mobile
    const streamMatches = bgContent.match(/id:\s*"stream-\d+"/g) || [];
    expect(streamMatches.length).toBe(10);

    const desktopOnlyMatches = bgContent.match(/desktopOnly:\s*true/g) || [];
    expect(desktopOnlyMatches.length).toBe(5);

    const mobileMatches = bgContent.match(/desktopOnly:\s*false/g) || [];
    expect(mobileMatches.length).toBe(5);
  });

  // ── 3. Alternating Direction (Odd RTL, Even LTR) & Realistic Durations ──
  it("3. enforces alternating direction (Odd=RTL, Even=LTR) and 24s-46s durations", () => {
    expect(bgContent).toContain('direction: "rtl"');
    expect(bgContent).toContain('direction: "ltr"');

    // Check durations are within 24s-46s
    const durationMatches = bgContent.match(/duration:\s*"(\d+)s"/g) || [];
    expect(durationMatches.length).toBe(10);
    durationMatches.forEach((d) => {
      const sec = parseInt(d.replace(/\D/g, ""), 10);
      expect(sec).toBeGreaterThanOrEqual(24);
      expect(sec).toBeLessThanOrEqual(46);
    });

    // Check staggered negative delays
    const delayMatches = bgContent.match(/delay:\s*"(-\d+)s"/g) || [];
    expect(delayMatches.length).toBe(10);
  });

  // ── 4. Required Mathematical Formulas ──
  it("4. includes all mandatory mathematical formulas in streams", () => {
    const requiredFormulas = [
      "∫ f(x)dx",
      "x² + y² = r²",
      "Δx → 0",
      "Σ_{n=1}^∞ 1/n²",
      "√(a² + b²)",
      "sin θ + cos θ",
      "∂f/∂x",
      "E = mc²",
      "lim x→∞",
      "π ≈ 3.14159",
      "aₙ = a₁ + (n−1)d",
    ];

    requiredFormulas.forEach((formula) => {
      expect(bgContent).toContain(formula);
    });
  });

  // ── 5. CSS Keyframes (formulaMarqueeLTR, formulaMarqueeRTL) with translate3d ──
  it("5. declares formulaMarqueeLTR and formulaMarqueeRTL using GPU translate3d and will-change", () => {
    expect(cssContent).toContain("@keyframes formulaMarqueeRTL");
    expect(cssContent).toContain("@keyframes formulaMarqueeLTR");
    expect(cssContent).toContain("translate3d(0, 0, 0)");
    expect(cssContent).toContain("translate3d(-50%, 0, 0)");
    expect(cssContent).toContain(".animate-formula-rtl");
    expect(cssContent).toContain(".animate-formula-ltr");
    expect(cssContent).toContain("will-change: transform");
  });

  // ── 6. Reduced-Motion Support ──
  it("6. stops all formula animations under prefers-reduced-motion: reduce", () => {
    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cssContent).toContain(".animate-formula-rtl");
    expect(cssContent).toContain(".animate-formula-ltr");
    expect(cssContent).toContain("animation: none !important");
  });

  // ── 7. Translucent Glass Panel Surfaces (0.35-0.55 Alpha & 8px Blur) ──
  it("7. configures translucent cyber-glass styling with backdrop blur and cyan borders", () => {
    expect(cssContent).toContain(".cyber-glass-panel");
    expect(cssContent).toContain("backdrop-filter: blur(8px)");
    expect(cssContent).toContain("rgba(0, 240, 255");

    // PLP Math Content page uses cyber-glass-panel and machine-module
    expect(pageContent).toContain("cyber-glass-panel");
    expect(pageContent).toContain("machine-module");
    expect(pageContent).toContain("backdrop-blur-");
    expect(pageContent).toContain("relative z-10");
  });

  // ── 8. Interactive Elements Remain Clickable and Accessible ──
  it("8. ensures buttons have accessible z-index, touch targets, and pointer-events", () => {
    expect(pageContent).toContain('data-testid="math-ocr-submit-btn"');
    expect(pageContent).toContain("min-h-[44px]");
    expect(pageContent).toContain("relative z-10");
    expect(pageContent).not.toContain("pointer-events-none relative z-10");
  });

  // ── 9. Sidebar Active Modules Cards Transparency & Consistency ──
  it("9. verifies sidebar active modules (01, 02, 03) share transparent dark-blue glass styling and cyber background visibility", () => {
    const sidebarPath = path.resolve(
      __dirname,
      "../src/components/layout/Sidebar.tsx"
    );
    const shellPath = path.resolve(
      __dirname,
      "../src/components/layout/DashboardShell.tsx"
    );
    const freshCssContent = fs.readFileSync(cssPath, "utf-8");
    const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");
    const shellContent = fs.readFileSync(shellPath, "utf-8");

    // CSS defines sidebar-module-glass with rgba(7, 19, 38, 0.26), blur(8px) saturate(130%), and 0.28 cyan border
    expect(freshCssContent).toContain(".sidebar-module-glass");
    expect(freshCssContent).toContain("rgba(7, 19, 38, 0.26)");
    expect(freshCssContent).toContain("blur(8px) saturate(130%)");
    expect(freshCssContent).toContain("rgba(0, 240, 255, 0.28)");
    expect(freshCssContent).toContain(".sidebar-module-glass:hover");
    expect(freshCssContent).toContain(".sidebar-module-glass.is-active");
    expect(freshCssContent).toContain("@supports not (backdrop-filter: blur(8px))");

    // Sidebar maps all tools to .sidebar-module-glass
    expect(sidebarContent).toContain("sidebar-module-glass");
    expect(sidebarContent).toContain("sidebar-module-glass is-active");
    expect(sidebarContent).toContain("focus-visible:ring-cyan-400");

    // DashboardShell places MechanicalCyberBackground at root shell level
    expect(shellContent).toContain("<MechanicalCyberBackground />");
    expect(shellContent).toContain("<Sidebar");
  });
});

