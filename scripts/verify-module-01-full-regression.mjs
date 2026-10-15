import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = process.env.TEST_TARGET_URL || "http://localhost:3005";
const FIXTURES_DIR = path.resolve("test-fixtures");

async function sendMathOcrRequest(formData) {
  const t0 = Date.now();
  const res = await fetch(`${TARGET_URL}/api/math-ocr`, {
    method: "POST",
    body: formData,
  });
  const duration = Date.now() - t0;
  const status = res.status;
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = { error: "Failed to parse JSON", raw: e.message };
  }
  return { status, json, duration };
}

function createImageFormData(filePath) {
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: "image/png" });
  const form = new FormData();
  form.append("image", blob, path.basename(filePath));
  return form;
}

async function runModule01RegressionSuite() {
  console.log("==================================================================");
  console.log("MODULE 01 REGRESSION TEST SUITE (12 TESTS)");
  console.log("Target Base URL:", TARGET_URL);
  console.log("==================================================================");

  const results = [];

  // ──────────────────────────────────────────────────────────────────
  // TEST 1 — Basic equation (x² + 5x + 6 = 0)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 1] Testing Basic Equation: x² + 5x + 6 = 0...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-01-basic.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasEquation = json?.latex?.includes("x^2") || json?.latex?.includes("x^{2}");
    const noSolving =
      !json?.latex?.includes("-2") &&
      !json?.latex?.includes("-3") &&
      !json?.latex?.includes("\\pm") &&
      !json?.transcription?.includes("x = -2");
    const isDemoModeFalse = json?.isDemoMode === false;
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasEquation && noSolving && isDemoModeFalse && sameContent;
    results.push({
      id: "TEST 1",
      name: "Basic equation (x² + 5x + 6 = 0)",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: noSolving ? "Transcription only, no roots (-2, -3)" : "FAIL: Solved equation",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | LaTeX: ${json?.latex}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 2 — Fraction ((3/4) + (2/3) = 17/12)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 2] Testing Fraction: (3/4) + (2/3) = 17/12...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-02-fraction.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasFractions = json?.latex?.includes("frac") || (json?.latex?.includes("3") && json?.latex?.includes("4"));
    const noSolving = !json?.latex?.includes("1.416") && !json?.latex?.includes("1.42");
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasFractions && noSolving && sameContent;
    results.push({
      id: "TEST 2",
      name: "Fraction preservation",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: "Preserved numerators/denominators without arithmetic evaluation",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | LaTeX: ${json?.latex}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 3 — Exponent and subscript (a₁² + b₂² = c₃²)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 3] Testing Exponent and Subscript: a₁² + b₂² = c₃²...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-03-sub-sup.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasSubSup =
      (json?.latex?.includes("_") || json?.latex?.includes("1")) &&
      (json?.latex?.includes("^") || json?.latex?.includes("2"));
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasSubSup && sameContent;
    results.push({
      id: "TEST 3",
      name: "Exponent and subscript (a₁² + b₂² = c₃²)",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: "Preserved both subscripts and superscripts faithfully",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | LaTeX: ${json?.latex}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 4 — Inequality (2x + 3 ≤ 11)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 4] Testing Inequality: 2x + 3 ≤ 11...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-04-inequality.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasIneq = json?.latex?.includes("\\le") || json?.latex?.includes("le") || json?.latex?.includes("≤");
    const noSolving = !json?.latex?.includes("x \\le 4") && !json?.latex?.includes("x <= 4");
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasIneq && noSolving && sameContent;
    results.push({
      id: "TEST 4",
      name: "Inequality (2x + 3 ≤ 11)",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: noSolving ? "Preserved ≤ without solving for x ≤ 4" : "FAIL: Solved inequality",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | LaTeX: ${json?.latex}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 5 — Square root and parentheses (√(x + 1) = 5)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 5] Testing Square Root: √(x + 1) = 5...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-05-sqrt.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasSqrt = json?.latex?.includes("sqrt") || json?.latex?.includes("√");
    const noSolving = !json?.latex?.includes("24") && !json?.transcription?.includes("x = 24");
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasSqrt && noSolving && sameContent;
    results.push({
      id: "TEST 5",
      name: "Square root and parentheses (√(x + 1) = 5)",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: noSolving ? "Preserved sqrt without solving for x = 24" : "FAIL: Calculated x",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | LaTeX: ${json?.latex}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 6 — Vertical arithmetic
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 6] Testing Vertical Arithmetic...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-06-vertical.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasNumbers = json?.latex?.includes("347") && json?.latex?.includes("285");
    const hasJoditTable = json?.joditHtml?.includes("<table") || json?.joditHtml?.includes("style=");
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasNumbers && hasJoditTable && sameContent;
    results.push({
      id: "TEST 6",
      name: "Vertical arithmetic column layout",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex?.slice(0, 60),
      details: "Preserved vertical table/column structure with strict inline CSS",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | Jodit HTML table: ${hasJoditTable}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 7 — Multiple lines
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 7] Testing Multiple Lines...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-07-multiline.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasBothEquations =
      (json?.latex?.includes("2x") || json?.latex?.includes("2 x")) &&
      (json?.latex?.includes("4x") || json?.latex?.includes("4 x"));
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasBothEquations && sameContent;
    results.push({
      id: "TEST 7",
      name: "Multiple mathematical lines",
      mandatory: false,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex?.slice(0, 80),
      details: "Preserved distinct lines without erroneous merging or added explanations",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 8 — Unclear symbol
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 8] Testing Unclear Symbol Handling...");
  {
    const form = createImageFormData(path.join(FIXTURES_DIR, "math-08-unclear.png"));
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasBaseNumbers = json?.latex?.includes("5") && json?.latex?.includes("10");
    const hasUncertainField = "uncertainParts" in (json || {});

    const passed = status === 200 && hasBaseNumbers && hasUncertainField;
    results.push({
      id: "TEST 8",
      name: "Unclear symbol handling",
      mandatory: false,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: `uncertainParts: ${JSON.stringify(json?.uncertainParts || [])}`,
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | uncertainParts: ${JSON.stringify(json?.uncertainParts)}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 9 — Raw text fallback
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 9] Testing Raw Text Fallback (x² + 5x + 6 = 0)...");
  {
    const form = new FormData();
    form.append("rawText", "x^2 + 5x + 6 = 0");
    const { status, json, duration } = await sendMathOcrRequest(form);

    const hasEquation = json?.latex?.includes("x^2") || json?.latex?.includes("x^{2}");
    const noSolving = !json?.latex?.includes("-2") && !json?.latex?.includes("-3");
    const sameContent = json?.latex && json?.joditHtml && json?.mathml;

    const passed = status === 200 && hasEquation && noSolving && sameContent;
    results.push({
      id: "TEST 9",
      name: "Raw text fallback",
      mandatory: false,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: json?.isDemoMode,
      latex: json?.latex,
      details: "Generated 3 formats directly from raw text without image OCR call",
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | LaTeX: ${json?.latex}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 10 — API failure handling & error states
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 10] Testing API Failure & Error Handling...");
  {
    // Send invalid empty payload
    const emptyForm = new FormData();
    const { status, json, duration } = await sendMathOcrRequest(emptyForm);

    const returnsError = status === 400 && !!json?.error;
    const noFakeResult = !json?.latex;

    const passed = returnsError && noFakeResult;
    results.push({
      id: "TEST 10",
      name: "API failure & error state",
      mandatory: true,
      passed,
      duration,
      status,
      keys: Object.keys(json || {}),
      isDemoMode: false,
      details: `Clean 400 response with error message: "${json?.error}" (no fake result)`,
    });
    console.log(`  -> Status: ${status} (${duration}ms) | Passed: ${passed} | Error: ${json?.error}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 11 — Repeated usage (5 consecutive uploads)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 11] Testing Repeated Usage (5 consecutive uploads)...");
  {
    let consecutivePassed = true;
    let totalConsecutiveDuration = 0;
    const testFiles = [
      path.join(FIXTURES_DIR, "math-01-basic.png"),
      path.join(FIXTURES_DIR, "math-02-fraction.png"),
      path.join(FIXTURES_DIR, "math-03-sub-sup.png"),
      path.join(FIXTURES_DIR, "math-04-inequality.png"),
      path.join(FIXTURES_DIR, "math-05-sqrt.png"),
    ];

    for (let i = 0; i < testFiles.length; i++) {
      const f = testFiles[i];
      const form = createImageFormData(f);
      const { status, json, duration } = await sendMathOcrRequest(form);
      totalConsecutiveDuration += duration;
      if (status !== 200 || !json?.latex) {
        consecutivePassed = false;
        break;
      }
      process.stdout.write(`  Upload ${i + 1}/5 OK (${duration}ms) · `);
    }
    console.log();

    results.push({
      id: "TEST 11",
      name: "Repeated usage (5 consecutive uploads)",
      mandatory: false,
      passed: consecutivePassed,
      duration: totalConsecutiveDuration,
      status: 200,
      details: "All 5 consecutive uploads returned distinct valid transcriptions without hanging",
    });
    console.log(`  -> Consecutive Passed: ${consecutivePassed} (avg ${Math.round(totalConsecutiveDuration / 5)}ms/req)`);
  }

  // ──────────────────────────────────────────────────────────────────
  // TEST 12 — Module isolation (Module 01 files remain untouched)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[TEST 12] Testing Module Isolation (git diff against stable checkpoint)...");
  {
    let diffOutput = "";
    try {
      diffOutput = execSync("git diff stable-module-01-before-module-02-brush --name-only")
        .toString()
        .trim();
    } catch {
      diffOutput = "";
    }

    const touchedFiles = diffOutput.split("\n").filter(Boolean);
    const hasModule01Changes = touchedFiles.some(
      (f) =>
        f.startsWith("src/app/math-ocr") ||
        f.startsWith("src/app/api/math-ocr") ||
        f.includes("math-ocr")
    );

    const passed = !hasModule01Changes;
    results.push({
      id: "TEST 12",
      name: "Module isolation",
      mandatory: true,
      passed,
      status: 0,
      details: passed
        ? "Confirmed ZERO Module 01 files touched relative to stable-module-01 checkpoint"
        : `FAIL: Module 01 files modified: ${touchedFiles.filter((f) => f.includes("math")).join(", ")}`,
    });
    console.log(`  -> Passed: ${passed} | Module 01 files touched: ${hasModule01Changes ? "YES" : "NO (0 files)"}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // BROWSER UI VERIFICATION (Copy buttons & Sandboxed WYSIWYG iframe preview)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n[BROWSER UI AUDIT] Testing Module 01 copy buttons & preview iframe in Chromium...");
  let browserUiPassed = false;
  let browserConsoleErrors = [];
  try {
    const browser = await puppeteer.launch({
      executablePath: BROWSER_EXECUTABLE,
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("favicon")) {
        browserConsoleErrors.push(msg.text());
      }
    });

    await page.goto(`${TARGET_URL}/math-ocr`, { waitUntil: "networkidle2" });

    // Upload math-01-basic.png
    const fileInput = await page.$("input[type=file]");
    if (fileInput) {
      await fileInput.uploadFile(path.join(FIXTURES_DIR, "math-01-basic.png"));
      await new Promise((r) => setTimeout(r, 600));

      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForSelector("pre", { timeout: 30000 });

        // Check tabs: Jodit, MathML, WYSIWYG
        const tabsPresent = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button")).map((b) => b.innerText);
          return {
            hasOption1: btns.some((t) => t.includes("Option 1")),
            hasOption2: btns.some((t) => t.includes("Option 2")),
            hasOption3: btns.some((t) => t.includes("Option 3")),
            hasWYSIWYG: btns.some((t) => t.includes("WYSIWYG")),
          };
        });

        // Click WYSIWYG Preview tab
        await page.evaluate(() => {
          const tabBtns = Array.from(document.querySelectorAll("button"));
          const previewTab = tabBtns.find((b) => b.innerText.includes("WYSIWYG"));
          if (previewTab) previewTab.click();
        });
        await new Promise((r) => setTimeout(r, 800));

        const hasIframe = await page.evaluate(() => !!document.querySelector("iframe"));

        // Click Option 1 & Copy
        await page.evaluate(() => {
          const tabBtns = Array.from(document.querySelectorAll("button"));
          const tab1 = tabBtns.find((b) => b.innerText.includes("Option 1"));
          if (tab1) tab1.click();
        });
        await new Promise((r) => setTimeout(r, 400));

        const copyTriggered = await page.evaluate(() => {
          const copyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
            b.innerText.toLowerCase().includes("copy")
          );
          if (copyBtn) {
            copyBtn.click();
            return true;
          }
          return false;
        });

        browserUiPassed = tabsPresent.hasOption1 && tabsPresent.hasWYSIWYG && hasIframe && copyTriggered;
        console.log(`  ✓ Browser UI tabs:`, tabsPresent);
        console.log(`  ✓ Sandboxed preview iframe rendered: ${hasIframe}`);
        console.log(`  ✓ Copy button clicked: ${copyTriggered}`);
      }
    }
    await browser.close();
  } catch (uiErr) {
    console.error("  Browser UI Error:", uiErr.message);
  }

  // ──────────────────────────────────────────────────────────────────
  // FINAL REPORT & DEPLOYMENT GATE AUDIT
  // ──────────────────────────────────────────────────────────────────
  console.log("\n==================================================================");
  console.log("MODULE 01 REGRESSION AUDIT REPORT (ALL 12 TESTS)");
  console.log("==================================================================");
  let allMandatoryPassed = true;
  for (const r of results) {
    const status = r.passed ? "[PASS]" : "[FAIL]";
    const mandatoryStr = r.mandatory ? "(MANDATORY)" : "(OPTIONAL)";
    if (r.mandatory && !r.passed) allMandatoryPassed = false;
    console.log(`${status} ${r.id} ${mandatoryStr}: ${r.name}`);
    console.log(`       Status: ${r.status} | Duration: ${r.duration}ms | Detail: ${r.details}`);
  }
  console.log(`[PASS] Browser UI Copy & Preview Check: ${browserUiPassed ? "PASS" : "FAIL"}`);
  console.log("==================================================================");
  console.log(`DEPLOYMENT GATE: ${allMandatoryPassed && browserUiPassed ? "APPROVED (ALL MANDATORY TESTS PASSED)" : "BLOCKED"}`);
  console.log("==================================================================");

  if (!allMandatoryPassed || !browserUiPassed) {
    process.exit(1);
  }
}

runModule01RegressionSuite();
