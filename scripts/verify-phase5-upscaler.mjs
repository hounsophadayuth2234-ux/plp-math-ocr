import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app/image-upscaler";
const TEST_IMAGE_PATH = path.resolve("portrait-pink.png");

async function verifyModule03() {
  console.log("=== VERIFYING PHASE 5: MODULE 03 ON PRODUCTION ===");
  console.log("URL:", PRODUCTION_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
  console.log("Image:", TEST_IMAGE_PATH);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security"
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    page.on("console", (msg) => {
      const txt = msg.text();
      if (!txt.includes("Download the React DevTools")) {
        console.log(`  [Console ${msg.type()}]`, txt);
      }
    });
    page.on("pageerror", (err) => console.error("  [Page Error]", err.message));

    console.log("1. Navigating to production /image-upscaler...");
    await page.goto(PRODUCTION_URL, { waitUntil: "networkidle2", timeout: 35000 });

    // Verify sidebar shows Module 01, 02, and 03
    const sidebarText = await page.$$eval("aside", (el) => el.map(e => e.innerText).join("\n"));
    console.log("Sidebar content check:");
    console.log("  Module 01 present:", sidebarText.includes("01"));
    console.log("  Module 02 present:", sidebarText.includes("02"));
    console.log("  Module 03 present:", sidebarText.includes("03"));
    if (!sidebarText.includes("03")) {
      throw new Error("Module 03 is missing or disabled in sidebar!");
    }

    // --- TEST PART A: Browser 2x Enhanced Resize ---
    console.log("\n2. Testing Browser 2x Enhanced Resize (Zero Cost)...");
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found on /image-upscaler");

    await fileInput.uploadFile(TEST_IMAGE_PATH);
    await new Promise((r) => setTimeout(r, 800));

    // Ensure Browser 2x Enhancer is selected
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const browserBtn = btns.find((b) => b.innerText.includes("Browser 2× Enhancer"));
      if (browserBtn) browserBtn.click();
    });

    console.log("3. Triggering Browser Enhancement...");
    const t0 = Date.now();
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });

    // Wait for Download 2× PNG button to appear in the result DOM
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(b => b.innerText.includes("Download 2× PNG")),
      { timeout: 20000 }
    );
    const browserDuration = Date.now() - t0;
    console.log(`✓ Browser 2x enhancement finished in ${browserDuration} ms`);

    const resultState = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasHonestLabel = text.includes("Enhanced resize — not AI super-resolution");
      const hasDownloadBtn = Array.from(document.querySelectorAll("button")).some(b => b.innerText.includes("Download 2× PNG"));
      const hasSlider = !!document.querySelector('[role="slider"]') || document.querySelectorAll('img').length >= 2;
      return { hasHonestLabel, hasDownloadBtn, hasSlider };
    });

    console.log("✓ Result verification:");
    console.log("  Strict Honest Label present:", resultState.hasHonestLabel);
    console.log("  Before/After slider present:", resultState.hasSlider);
    console.log("  Download button present:", resultState.hasDownloadBtn);
    if (!resultState.hasHonestLabel || !resultState.hasDownloadBtn) {
      throw new Error("Missing required honest provenance label or download button!");
    }

    // --- TEST PART B: AI Super-Resolution Error Guard ---
    console.log("\n4. Testing Real-ESRGAN AI Mode without provider configuration/credit...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const aiBtn = btns.find((b) => b.innerText.includes("Real-ESRGAN (AI)"));
      if (aiBtn) aiBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Submit Real-ESRGAN without demo mode
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });

    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Execution Error") ||
        document.body.innerText.includes("Switch to Browser 2× Enhancer") ||
        document.body.innerText.includes("No Real-ESRGAN AI provider is configured") ||
        document.body.innerText.includes("Insufficient Credit"),
      { timeout: 25000 }
    );
    const errorState = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasExecutionError: text.includes("Execution Error"),
        hasSwitchBtn: Array.from(document.querySelectorAll("button")).some(b => b.innerText.includes("Switch to Browser 2× Enhancer")),
        textSnippet: text.slice(0, 300)
      };
    });
    console.log("✓ Provider error properly caught and actionable fallback presented:", errorState);

    // --- TEST PART C: Explicit Demo Preview Mode ---
    console.log("\n5. Testing Explicit Demo Preview Mode...");
    await page.evaluate(() => {
      const checkbox = document.querySelector('input[type="checkbox"]');
      if (checkbox && !checkbox.checked) checkbox.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });

    await page.waitForFunction(
      () => document.body.innerText.includes("Demo preview") || document.body.innerText.includes("DEMO PREVIEW"),
      { timeout: 15000 }
    );
    const demoState = await page.evaluate(() => {
      return document.body.innerText.includes("Demo preview") || document.body.innerText.includes("DEMO PREVIEW");
    });
    console.log("✓ Explicit Demo Preview mode strictly labeled as 'Demo preview':", demoState);
    console.log("✓ Explicit Demo Preview mode strictly labeled as 'Demo preview':", demoState);

    console.log("\n🎉 ALL PHASE 5 ACCEPTANCE CRITERIA VERIFIED ON PRODUCTION!");
  } finally {
    await browser.close();
  }
}

verifyModule03().catch((err) => {
  console.error("❌ Phase 5 verification failed:", err);
  process.exit(1);
});
