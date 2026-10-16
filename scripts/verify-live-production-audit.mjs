import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";

const report = {
  redirectCheck: null,
  metadataCheck: null,
  viewports: [],
  keyboardAndA11y: null,
  uiWorkflow: null,
  success: true,
};

async function verify() {
  console.log("=== LIVE PRODUCTION AUDIT ===");
  console.log(`Target: ${PRODUCTION_URL}\n`);

  // 1. HTTP Redirect Check
  console.log("[1/4] Checking HTTP 308 redirect on live URL...");
  const redirectRes = await fetch(`${PRODUCTION_URL}/math-ocr`, { redirect: "manual" });
  const location = redirectRes.headers.get("location");
  const redirectPassed = redirectRes.status === 308 && location === "/plp-math-content";
  console.log(`Status: ${redirectRes.status}, Location: ${location} -> ${redirectPassed ? "PASS" : "FAIL"}`);
  report.redirectCheck = { status: redirectRes.status, location, passed: redirectPassed };
  if (!redirectPassed) report.success = false;

  // 2. Launch Browser
  console.log("\n[2/4] Launching Headless Browser against production...");
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // Navigate to /plp-math-content
    await page.goto(`${PRODUCTION_URL}/plp-math-content`, { waitUntil: "networkidle2", timeout: 30000 });

    // Metadata Check
    const title = await page.title();
    const canonical = await page.$eval('link[rel="canonical"]', (el) => el.href).catch(() => null);
    const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.content).catch(() => null);
    console.log(`Page Title: ${title}`);
    console.log(`Canonical: ${canonical}`);
    console.log(`OG Title: ${ogTitle}`);

    const metadataPassed = title.includes("PLP Math Content") && canonical?.includes("/plp-math-content");
    report.metadataCheck = { title, canonical, ogTitle, passed: metadataPassed };
    if (!metadataPassed) report.success = false;

    // Viewport Responsiveness Audit
    console.log("\n[3/4] Testing Viewport Responsiveness across 5 viewports...");
    const viewports = [
      { name: "320px (iPhone SE)", width: 320, height: 667 },
      { name: "360px (Android)", width: 360, height: 740 },
      { name: "390px (iPhone 14/15/16)", width: 390, height: 844 },
      { name: "768px (iPad/Tablet)", width: 768, height: 1024 },
      { name: "1280px (Desktop)", width: 1280, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise((r) => setTimeout(r, 200));

      const overflow = await page.evaluate(() => {
        const clientW = document.documentElement.clientWidth;
        const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        return {
          clientWidth: clientW,
          scrollWidth: scrollW,
          hasHorizontalScrollbar: scrollW > clientW + 2,
        };
      });

      const vpPassed = !overflow.hasHorizontalScrollbar;
      console.log(`Viewport ${vp.name}: clientW=${overflow.clientWidth}, scrollW=${overflow.scrollWidth} -> ${vpPassed ? "PASS (No overflow)" : "FAIL"}`);
      report.viewports.push({ name: vp.name, ...overflow, passed: vpPassed });
      if (!vpPassed) report.success = false;
    }

    // 4. End-to-End Workflow & UI Test on Production
    console.log("\n[4/4] Testing Live UI Form Submission & Lifecycle...");
    await page.setViewport({ width: 1280, height: 900 });

    // Type equation into textarea
    await page.waitForSelector("#rawText");
    await page.click("#rawText");
    await page.type("#rawText", "x^2 + 5x + 6 = 0");

    // Click submit button
    const submitBtn = await page.waitForSelector('[data-testid="math-ocr-submit-btn"]');
    await submitBtn.click();

    // Verify loading spinner activates
    console.log("Submitted! Waiting for processing and result...");

    // Wait for result tabs to render
    await page.waitForSelector('[role="tablist"]', { timeout: 35000 });
    console.log("Result received and tabs rendered!");

    // Check LaTeX output tab
    const latexTab = await page.$("#tab-latex");
    const latexText = await page.evaluate(() => {
      const pre = document.querySelector("#tabpanel-latex pre");
      return pre ? pre.textContent.trim() : "";
    });
    console.log(`Rendered LaTeX: ${latexText}`);

    // Check elapsed badge
    const elapsedText = await page.$eval('[data-testid="math-ocr-elapsed-badge"]', (el) => el.textContent.trim()).catch(() => "");
    console.log(`Elapsed Badge: ${elapsedText}`);

    // Verify spinner stopped
    const isSpinnerPresent = await page.evaluate(() => {
      return Boolean(document.querySelector('.animate-spin'));
    });
    console.log(`Is spinner stopped: ${!isSpinnerPresent ? "YES (Stopped cleanly)" : "NO"}`);

    const workflowPassed = latexText.includes("x^2 + 5x + 6 = 0") && !isSpinnerPresent;
    report.uiWorkflow = {
      latexRendered: latexText,
      elapsedText,
      spinnerStopped: !isSpinnerPresent,
      passed: workflowPassed,
    };
    if (!workflowPassed) report.success = false;

  } finally {
    await browser.close();
  }

  fs.writeFileSync("scripts/live-production-audit.json", JSON.stringify(report, null, 2));
  console.log("\nAudit finished. Report saved to scripts/live-production-audit.json");
  console.log(`OVERALL RESULT: ${report.success ? "ALL AUDITS PASSED" : "AUDIT FAILED"}`);
}

verify().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
