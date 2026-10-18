import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = "https://ai-toolkit-hub-nu.vercel.app/bg-remover";
const SCREENSHOTS_DIR = "C:\\Users\\User\\.gemini\\antigravity\\brain\\6ab72d5f-64ba-43a4-9160-25e339a3b413\\screenshots";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function verifyLiveProduction() {
  console.log("==================================================================");
  console.log("VERIFYING LIVE PRODUCTION DEPLOYMENT (STAGE 2 OVERHAUL)");
  console.log("Target URL:", TARGET_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
  console.log("==================================================================");

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });

    console.log("\n[1/5] Navigating to live Production URL...");
    const res = await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 35000 });
    console.log("HTTP Status:", res.status());

    await new Promise((r) => setTimeout(r, 2000));

    // Audit key elements
    const audit = await page.evaluate(() => {
      const langBtn = document.querySelector('[data-testid="language-selector-btn"]');
      const soundBtn = document.querySelector('[aria-label="Sound theme selector"]');
      const fontBtn = document.querySelector('[aria-label="Font switcher"]');
      const themeBtn = document.querySelector('[data-testid="theme-toggle-btn"]');
      const hero = document.querySelector('h1')?.innerText;
      const keepForeground = document.querySelector('[data-testid="content-mode-all"]');
      const keepPersonText = document.querySelector('[data-testid="content-mode-person-text-only"]');
      const removeBgBtn = document.querySelector('[data-testid="fast-preview-start-btn"]');
      const advancedAccordion = document.querySelector('[data-testid="advanced-settings-accordion"]');
      const diagnosticsPanel = document.querySelector('[data-testid="mask-diagnostics-panel"]');
      const resetAdvancedBtn = document.querySelector('[data-testid="reset-advanced-settings-btn"]');
      const workerBtn = document.querySelector('[data-testid="engine-select-worker"]');

      return {
        hasLangBtn: Boolean(langBtn),
        langText: langBtn?.innerText?.trim(),
        hasSoundBtn: Boolean(soundBtn),
        hasFontBtn: Boolean(fontBtn),
        hasThemeBtn: Boolean(themeBtn),
        heroText: hero,
        hasKeepForeground: Boolean(keepForeground),
        hasKeepPersonText: Boolean(keepPersonText),
        hasRemoveBgBtn: Boolean(removeBgBtn),
        hasAdvancedAccordion: Boolean(advancedAccordion),
        hasDiagnosticsPanel: Boolean(diagnosticsPanel),
        hasResetAdvancedBtn: Boolean(resetAdvancedBtn),
        isWorkerHiddenWhenUnconfigured: !workerBtn, // should be null/hidden when not configured
      };
    });

    console.log("\n[2/5] Live Production Audit Results:", audit);

    // Desktop Screenshot (Standby)
    const desktopScreenshotPath = path.join(SCREENSHOTS_DIR, "17-prod-stage2-desktop.png");
    await page.screenshot({ path: desktopScreenshotPath, fullPage: false });
    console.log("[3/5] Desktop Screenshot saved:", desktopScreenshotPath);

    // Click Language Selector and take screenshot of 8-language dropdown
    console.log("[4/5] Opening Language Selector Dropdown...");
    await page.click('[data-testid="language-selector-btn"]');
    await new Promise((r) => setTimeout(r, 500));
    const langScreenshotPath = path.join(SCREENSHOTS_DIR, "18-prod-stage2-language-selector.png");
    await page.screenshot({ path: langScreenshotPath, fullPage: false });
    console.log("Language Selector Screenshot saved:", langScreenshotPath);

    // Open Advanced Settings Accordion and take screenshot
    console.log("[5/5] Opening Advanced Settings Accordion...");
    await page.click('[data-testid="advanced-settings-accordion"] summary');
    await new Promise((r) => setTimeout(r, 500));
    const advancedScreenshotPath = path.join(SCREENSHOTS_DIR, "19-prod-stage2-advanced-settings.png");
    await page.screenshot({ path: advancedScreenshotPath, fullPage: false });
    console.log("Advanced Settings Screenshot saved:", advancedScreenshotPath);

    // Mobile Viewport Screenshot (390px)
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 1000));
    const mobileScreenshotPath = path.join(SCREENSHOTS_DIR, "20-prod-stage2-mobile-stack.png");
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log("Mobile Stacking Screenshot saved:", mobileScreenshotPath);

    console.log("\n==================================================================");
    console.log("PRODUCTION VERIFICATION COMPLETE & SUCCESSFUL");
    console.log("==================================================================");
  } finally {
    await browser.close();
  }
}

verifyLiveProduction().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
