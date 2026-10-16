import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = "http://localhost:3009";

const EVIDENCE_DIR = path.resolve("evidence-screenshots");
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function runVerification() {
  console.log("=== STARTING MATH OCR BUG REPAIR VERIFICATION ===");
  console.log("Browser executable:", BROWSER_EXECUTABLE);
  console.log("Target URL:", TARGET_URL);

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  const results = {
    viewports: [],
    settingsModal: {},
    staleResultPreservation: {},
    passed: 0,
    failed: 0,
  };

  try {
    // -------------------------------------------------------------------
    // 1. Settings Modal Accessibility & Escape Key Check
    // -------------------------------------------------------------------
    console.log("\n--- Testing Settings Modal Accessibility & Escape Key ---");
    await page.goto(`${TARGET_URL}/math-ocr`, { waitUntil: "networkidle2" });

    // Click settings button in Header
    const settingsBtn = await page.$('button[data-testid="open-settings-modal-btn"]');
    if (settingsBtn) {
      await settingsBtn.click();
    } else {
      throw new Error("Could not find button[data-testid='open-settings-modal-btn'] in Header");
    }

    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    const dialogAttributes = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const title = document.getElementById("settings-modal-title");
      const quotaP = Array.from(document.querySelectorAll("p")).find((p) =>
        p.textContent?.includes("Powers Module 01")
      );
      return {
        hasDialogRole: !!dialog,
        isAriaModal: dialog?.getAttribute("aria-modal") === "true",
        ariaLabelledBy: dialog?.getAttribute("aria-labelledby"),
        titleText: title?.textContent?.trim(),
        quotaText: quotaP?.textContent?.trim(),
        has1500BlanketClaim: quotaP?.textContent?.includes("1,500 req/day") ?? false,
      };
    });

    console.log("Dialog attributes:", dialogAttributes);
    if (
      dialogAttributes.hasDialogRole &&
      dialogAttributes.isAriaModal &&
      dialogAttributes.ariaLabelledBy === "settings-modal-title" &&
      !dialogAttributes.has1500BlanketClaim
    ) {
      console.log("PASS: Settings modal has role=dialog, aria-modal=true, accessible label, and corrected quota claim.");
      results.passed++;
    } else {
      console.error("FAIL: Settings modal accessibility attributes mismatch.");
      results.failed++;
    }

    // Test Escape Key Closing
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 300));

    const dialogClosed = await page.evaluate(() => {
      return document.querySelector('[role="dialog"]') === null;
    });

    if (dialogClosed) {
      console.log("PASS: Pressing Escape closes the Settings modal.");
      results.passed++;
    } else {
      console.error("FAIL: Pressing Escape did not close the Settings modal.");
      results.failed++;
    }

    // -------------------------------------------------------------------
    // 2. Viewport Overflow Audit with Generated Vertical Addition Results
    // -------------------------------------------------------------------
    console.log("\n--- Testing Mobile Viewports with Vertical Addition Results ---");

    // Enable request interception to mock the vertical addition response
    await page.setRequestInterception(true);
    let mockResponse = {
      latex: "\\begin{array}{rl} 684 \\\\ + 257 \\\\ \\hline [___] \\end{array}",
      joditHtml: `<table style="border-collapse: collapse; font-family: monospace; font-size: 24px; text-align: right; width: auto; margin: 10px 0;"><tbody><tr><td style="padding: 2px 6px;">684</td></tr><tr><td style="padding: 2px 6px; border-bottom: 2px solid #000;">+ 257</td></tr><tr><td style="padding: 2px 6px; font-weight: bold;">[___]</td></tr></tbody></table>`,
      mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtable columnalign="right"><mtr><mtd><mn>684</mn></mtd></mtr><mtr><mtd><mo>+</mo><mn>257</mn></mtd></mtr><mtr><mtd><mrow><mo>[</mo><mtext>___</mtext><mo>]</mo></mrow></mtd></mtr></mtable></math>`,
      detectedType: "Arithmetic Problem",
      transcription: "684 + 257 = [___]",
      rawDescription: "Vertical addition problem with blank answer placeholder",
      uncertainParts: [],
      isDemoMode: false,
    };
    let interceptNext = true;

    page.on("request", (req) => {
      if (req.url().includes("/api/math-ocr") && req.method() === "POST") {
        if (interceptNext) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(mockResponse),
          });
        } else {
          // Mock 413 plain text
          req.respond({
            status: 413,
            contentType: "text/plain",
            body: "Request Entity Too Large\nFUNCTION_PAYLOAD_TOO_LARGE",
          });
        }
      } else {
        req.continue();
      }
    });

    // Enter vertical addition text
    await page.type("textarea#rawText", "  684\n+ 257\n-----\n[___]");
    const submitBtn = await page.$('button[data-testid="math-ocr-submit-btn"]');
    await submitBtn.click();

    // Wait for results to render
    await page.waitForSelector('[role="tablist"]', { timeout: 10000 });
    console.log("Output tabs rendered successfully.");

    // Test multiple viewports
    const viewportsToTest = [
      { name: "320px (Small Mobile)", width: 320, height: 600 },
      { name: "360px (Standard Mobile)", width: 360, height: 740 },
      { name: "390px (iPhone 12/13/14/15/16 Pro)", width: 390, height: 844 },
      { name: "768px (Tablet)", width: 768, height: 1024 },
      { name: "1280px (Desktop)", width: 1280, height: 900 },
    ];

    for (const vp of viewportsToTest) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 200));

      const vpMetrics = await page.evaluate(() => {
        const main = document.querySelector("main");
        const tablist = document.querySelector('[role="tablist"]');
        return {
          windowInnerWidth: window.innerWidth,
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          mainClientWidth: main?.clientWidth,
          mainScrollWidth: main?.scrollWidth,
          tablistClientWidth: tablist?.clientWidth,
          tablistScrollWidth: tablist?.scrollWidth,
        };
      });

      // No horizontal blowout on main or document:
      const docNoOverflow = vpMetrics.docScrollWidth <= vpMetrics.docClientWidth + 2;
      const mainNoOverflow = (vpMetrics.mainScrollWidth ?? 0) <= (vpMetrics.mainClientWidth ?? 0) + 2;
      const passed = docNoOverflow && mainNoOverflow;

      console.log(`Viewport ${vp.name}: doc=${vpMetrics.docClientWidth}/${vpMetrics.docScrollWidth}, main=${vpMetrics.mainClientWidth}/${vpMetrics.mainScrollWidth} -> ${passed ? "PASS" : "FAIL"}`);

      if (passed) results.passed++;
      else results.failed++;

      results.viewports.push({ vp: vp.name, metrics: vpMetrics, passed });

      if (vp.width === 390) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, "math-ocr-390px-verified.png"),
          fullPage: true,
        });
      }
    }

    // -------------------------------------------------------------------
    // 3. Stale State & Elapsed Time Overwrite Bug Fix Verification
    // -------------------------------------------------------------------
    console.log("\n--- Testing Failed Request Handling & Stale Elapsed Time Preservation ---");

    // Capture initial elapsed badge text
    const initialElapsedText = await page.$eval(
      '[data-testid="math-ocr-elapsed-badge"]',
      (el) => el.textContent?.trim()
    );
    console.log("Initial successful elapsed badge:", initialElapsedText);

    // Now trigger a failed request (HTTP 413 FUNCTION_PAYLOAD_TOO_LARGE)
    interceptNext = false;
    await page.evaluate(() => {
      const textarea = document.querySelector("textarea#rawText");
      if (textarea) textarea.value = "large equation causing 413";
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submitBtnAgain = await page.$('button[data-testid="math-ocr-submit-btn"]');
    await submitBtnAgain.click();

    // Wait for error banner
    await page.waitForSelector('[role="alert"]', { timeout: 10000 });

    const postErrorState = await page.evaluate(() => {
      const alert = document.querySelector('[role="alert"]');
      const elapsedBadge = document.querySelector('[data-testid="math-ocr-elapsed-badge"]');
      const staleBadge = document.querySelector('[data-testid="math-ocr-stale-badge"]');
      const latexPre = document.querySelector("pre");
      return {
        hasAlert: !!alert,
        alertText: alert?.textContent?.trim(),
        elapsedBadgeText: elapsedBadge?.textContent?.trim(),
        hasStaleBadge: !!staleBadge,
        previousLatexPreserved: !!latexPre?.textContent?.includes("684"),
      };
    });

    console.log("Post-failure state:", postErrorState);

    // Verify 413 error message is specific (not generic "Invalid response format from server")
    const hasSpecific413Message =
      postErrorState.alertText?.includes("Payload Too Large") ||
      postErrorState.alertText?.includes("ទំហំឯកសារធំពេក") ||
      postErrorState.alertText?.includes("4.5 MB");

    const noGenericJsonError = !postErrorState.alertText?.includes("Invalid response format from server");

    // Verify previous result's elapsed time was NOT overwritten by the failed request's elapsed time
    const elapsedNotOverwritten = postErrorState.elapsedBadgeText === initialElapsedText;

    if (
      hasSpecific413Message &&
      noGenericJsonError &&
      postErrorState.previousLatexPreserved &&
      elapsedNotOverwritten &&
      postErrorState.hasStaleBadge
    ) {
      console.log("PASS: 413 plain text is parsed with specific Khmer message, previous result is preserved, marked STALE, and elapsed duration is NOT overwritten.");
      results.passed++;
    } else {
      console.error("FAIL: Stale result or 413 message verification failed:", {
        hasSpecific413Message,
        noGenericJsonError,
        previousLatexPreserved: postErrorState.previousLatexPreserved,
        elapsedNotOverwritten,
        hasStaleBadge: postErrorState.hasStaleBadge,
      });
      results.failed++;
    }

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "math-ocr-stale-and-413-handled.png"),
      fullPage: true,
    });
  } catch (err) {
    console.error("Verification run failed:", err);
    results.failed++;
  } finally {
    await browser.close();
  }

  console.log("\n=======================================================");
  console.log(`VERIFICATION SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log("=======================================================");

  if (results.failed > 0) {
    process.exit(1);
  }
}

runVerification();
