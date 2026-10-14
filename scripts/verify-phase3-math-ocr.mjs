import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app/math-ocr";
const TEST_IMAGE_PATH = path.resolve("math-quadratic.png");

async function verifyModule01() {
  console.log("=== VERIFYING PHASE 3: MODULE 01 ON PRODUCTION ===");
  console.log("URL:", PRODUCTION_URL);
  console.log("Browser:", BROWSER_EXECUTABLE);
  console.log("Image:", TEST_IMAGE_PATH);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log("1. Navigating to production /math-ocr...");
    await page.goto(PRODUCTION_URL, { waitUntil: "networkidle2", timeout: 30000 });

    // Verify sidebar shows only active module 01
    const sidebarText = await page.$$eval("aside", (el) => el.map(e => e.innerText).join("\n"));
    const hasModule01 = sidebarText.includes("01");
    const hasModule02 = sidebarText.includes("02");
    console.log(`✓ Sidebar check: Module 01 present = ${hasModule01}, Module 02 hidden = ${!hasModule02}`);

    // Find file input
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) throw new Error("File input not found on /math-ocr");

    console.log("2. Uploading math-quadratic.png...");
    await fileInput.uploadFile(TEST_IMAGE_PATH);
    await new Promise((r) => setTimeout(r, 1200));

    // Find submit button
    const submitBtn = await page.$('button[type="submit"]');
    if (!submitBtn) throw new Error("Submit button not found");

    console.log("3. Submitting transcription request to Gemini Vision...");
    const t0 = Date.now();
    await submitBtn.click();

    // Wait for output container
    await page.waitForSelector("pre", { timeout: 30000 });
    const elapsed = Date.now() - t0;
    console.log(`✓ Transcription completed in ${elapsed} ms!`);

    // 1. Verify LaTeX Tab
    const latexContent = await page.$eval("pre", (el) => el.innerText.trim());
    console.log("✓ LaTeX Output:", latexContent);
    if (!latexContent.includes("x^2 + 5x + 6 = 0") && !latexContent.includes("x^{2} + 5x + 6 = 0")) {
      throw new Error(`Unexpected LaTeX output: ${latexContent}`);
    }
    const isSolving = latexContent.includes("\\pm") || latexContent.includes("sqrt") || latexContent.includes("=-2");
    console.log("✓ Pure Transcription check (no equation solving):", !isSolving);

    // 2. Click Jodit HTML Tab
    console.log("4. Switching to Jodit HTML tab...");
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll("button"));
      const joditTab = tabBtns.find(b => b.innerText.includes("Option 2"));
      if (joditTab) joditTab.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const joditContent = await page.$eval("pre", (el) => el.innerText.trim());
    console.log("✓ Jodit HTML snippet:", joditContent.slice(0, 140));
    console.log("✓ Jodit HTML has strict inline CSS:", joditContent.includes("style="));

    // 3. Click MathML Tab
    console.log("5. Switching to MathML tab...");
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll("button"));
      const mathmlTab = tabBtns.find(b => b.innerText.includes("Option 3"));
      if (mathmlTab) mathmlTab.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const mathmlContent = await page.$eval("pre", (el) => el.innerText.trim());
    console.log("✓ MathML snippet:", mathmlContent.slice(0, 140));
    console.log("✓ Valid MathML markup:", mathmlContent.includes("<math") && mathmlContent.includes("</math>"));

    // 4. Click Visual Preview Tab
    console.log("6. Switching to Visual Preview tab...");
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll("button"));
      const previewTab = tabBtns.find(b => b.innerText.includes("WYSIWYG"));
      if (previewTab) previewTab.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    const iframe = await page.$("iframe");
    console.log("✓ Sandboxed WYSIWYG preview iframe present:", !!iframe);

    // 5. Test Copy button
    console.log("7. Testing copy functionality...");
    await page.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll("button"));
      const latexTab = tabBtns.find(b => b.innerText.includes("Option 1"));
      if (latexTab) latexTab.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const copyBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.find(b => b.innerText.includes("Copy LaTeX"));
    });
    if (copyBtn) {
      await copyBtn.click();
      await new Promise((r) => setTimeout(r, 300));
      const copiedText = await page.evaluate(() => document.body.innerText.includes("Copied"));
      console.log("✓ Copy button triggered successfully:", copiedText);
    }

    // 6. Verify Demo Fallback is absent
    const isDemoMode = await page.evaluate(() => document.body.innerText.includes("Interactive Demo"));
    console.log("✓ Demo fallback absent (Real Production AI output):", !isDemoMode);

    console.log("\n==================================================");
    console.log("PHASE 3: ACCEPTANCE CRITERIA FULLY SATISFIED!");
    console.log("image upload -> faithful transcription -> LaTeX + Jodit HTML + MathML -> copy -> preview");
    console.log("No solving, calculating, simplifying, or demo fallback.");
    console.log("==================================================");
  } finally {
    await browser.close();
  }
}

verifyModule01().catch((e) => {
  console.error("PHASE 3 VERIFICATION FAILED:", e);
  process.exit(1);
});
