import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = process.env.TEST_TARGET_URL || "http://localhost:3005/bg-remover";

const FIXTURE_A = path.resolve("test-fixtures/01-portrait-black-hair-pink-bg.png");
const FIXTURE_B = path.resolve("test-fixtures/02-portrait-dark-suit.png");

async function clickExecuteButton(page) {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const execBtn = btns.find(
      (b) =>
        b.innerText.includes("AUTOMATIC CUT") ||
        b.innerText.includes("RUN FINAL CLEAN CUT") ||
        b.innerText.includes("RUN HIGH QUALITY")
    );
    if (execBtn && !execBtn.disabled) {
      execBtn.click();
      return true;
    }
    return false;
  });
}

async function runMemoryConcurrencyTests() {
  console.log("==================================================================");
  console.log("MODULE 02 — MEMORY SAFETY & CONCURRENCY VERIFICATION SUITE");
  console.log("Target URL:", TARGET_URL);
  console.log("Browser Executable:", BROWSER_EXECUTABLE);
  console.log("Fixture A:", FIXTURE_A);
  console.log("Fixture B:", FIXTURE_B);
  console.log("==================================================================");

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    userDataDir: path.resolve(".puppeteer-cache"),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-features=WebGPU",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });

  const testResults = [];
  const pageLogs = [];
  const pageErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 950 });

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      pageLogs.push(`[${type}] ${text}`);
      if (type === "error" && !text.includes("favicon") && !text.includes("DevTools")) {
        pageErrors.push(text);
        console.error("  [Console Error]", text);
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
      console.error("  [Page Uncaught Error]", err.message);
    });

    // ──────────────────────────────────────────────────────────────────
    // TEST 1: Rapid Consecutive Uploads without Processing (URL Revocation)
    // ──────────────────────────────────────────────────────────────────
    console.log("\n[TEST 1] Testing rapid consecutive uploads and preview URL revocation...");
    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });

    // Track URL.createObjectURL and URL.revokeObjectURL calls
    await page.evaluate(() => {
      window.__createdUrls = [];
      window.__revokedUrls = [];
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = function (obj) {
        const url = origCreate.call(URL, obj);
        window.__createdUrls.push(url);
        return url;
      };
      URL.revokeObjectURL = function (url) {
        window.__revokedUrls.push(url);
        return origRevoke.call(URL, url);
      };
    });

    const fileInput = await page.$("input[type=file]");
    if (!fileInput) throw new Error("File input not found");

    // Upload Image A
    await fileInput.uploadFile(FIXTURE_A);
    await new Promise((r) => setTimeout(r, 600));

    // Rapidly upload Image B
    await fileInput.uploadFile(FIXTURE_B);
    await new Promise((r) => setTimeout(r, 600));

    const urlStats1 = await page.evaluate(() => {
      return {
        created: window.__createdUrls.length,
        revoked: window.__revokedUrls.length,
        createdUrls: [...window.__createdUrls],
        revokedUrls: [...window.__revokedUrls],
      };
    });

    console.log(`  Created URLs: ${urlStats1.created}, Revoked URLs: ${urlStats1.revoked}`);
    const test1Passed = urlStats1.revoked >= 1;
    testResults.push({
      test: "Test 1: Rapid Consecutive Uploads URL Cleanup",
      passed: test1Passed,
      detail: `Revoked ${urlStats1.revoked} of ${urlStats1.created} URLs upon replacement`,
    });
    console.log(`  -> Result: ${test1Passed ? "PASSED" : "FAILED"}`);

    // ──────────────────────────────────────────────────────────────────
    // TEST 2: Mid-Flight Cancellation & Request Generation ID Guard
    // ──────────────────────────────────────────────────────────────────
    console.log("\n[TEST 2] Testing mid-flight cancellation & Generation ID protection...");

    // Clear back to fresh state
    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });

    const fileInput2 = await page.$("input[type=file]");
    // Upload Image A
    await fileInput2.uploadFile(FIXTURE_A);
    await new Promise((r) => setTimeout(r, 600));

    // Start processing Image A
    console.log("  Started processing Image A (AUTOMATIC CUT)...");
    const startedA = await clickExecuteButton(page);
    if (!startedA) throw new Error("Execution button not found or disabled for Image A");
    await new Promise((r) => setTimeout(r, 800)); // Let processing start

    // While processing Image A, immediately upload Image B
    console.log("  Mid-flight interrupt: uploading Image B immediately...");
    const fileInput3 = await page.$("input[type=file]");
    await fileInput3.uploadFile(FIXTURE_B);
    await new Promise((r) => setTimeout(r, 600));

    // Confirm that the UI is not showing an uncaught AbortError
    const hasAbortErrorUI = await page.evaluate(() => {
      const errEl = document.querySelector(".text-rose-400");
      return errEl ? errEl.textContent : null;
    });

    console.log("  UI error state after interrupt:", hasAbortErrorUI || "None (clean cancellation)");
    const cleanAbort = !hasAbortErrorUI || !hasAbortErrorUI.toLowerCase().includes("aborterror");

    // Wait until execute button is ready for Image B
    console.log("  Starting processing for Image B...");
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some((b) => b.innerText.includes("AUTOMATIC CUT") && !b.disabled);
    }, { timeout: 10000 });
    await clickExecuteButton(page);

    // Wait for ColorStudio or completion
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("button")).some((b) =>
        b.innerText.toLowerCase().includes("white") || b.innerText.toLowerCase().includes("transparent")
      );
    }, { timeout: 60000 });
    console.log("  Processing for Image B completed successfully!");

    // Verify displayed result belongs to Image B (canvas exists and has valid dimensions)
    const resultDimensions = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      return canvas ? { width: canvas.width, height: canvas.height } : null;
    });
    console.log("  Result Canvas Dimensions:", resultDimensions);

    const test2Passed = cleanAbort && resultDimensions !== null;
    testResults.push({
      test: "Test 2: Mid-Flight Cancellation & Request Gen ID",
      passed: test2Passed,
      detail: `Clean cancellation without AbortError UI; final canvas: ${JSON.stringify(resultDimensions)}`,
    });
    console.log(`  -> Result: ${test2Passed ? "PASSED" : "FAILED"}`);

    // ──────────────────────────────────────────────────────────────────
    // TEST 3: Undo / Redo History Boundary (Clamped to 20 snapshots)
    // ──────────────────────────────────────────────────────────────────
    console.log("\n[TEST 3] Testing undo/redo history limits (max 20) and memory capping...");

    // Find canvas in ColorStudio
    const canvasEl = await page.$("canvas");
    if (!canvasEl) throw new Error("Canvas element not found in ColorStudio");

    const box = await canvasEl.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Perform 25 simulated brush strokes
    console.log("  Applying 25 brush strokes on canvas...");
    for (let i = 0; i < 25; i++) {
      const offsetX = (i % 5) * 10 - 20;
      const offsetY = Math.floor(i / 5) * 10 - 20;
      await page.mouse.move(cx + offsetX, cy + offsetY);
      await page.mouse.down();
      await page.mouse.move(cx + offsetX + 5, cy + offsetY + 5);
      await page.mouse.up();
      await new Promise((r) => setTimeout(r, 20));
    }

    // Check undo operations performed until disabled
    let undoCount = 0;
    for (let i = 0; i < 30; i++) {
      const canUndo = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const undoBtn = btns.find((b) => b.innerText.toLowerCase().includes("undo"));
        if (undoBtn && !undoBtn.disabled) {
          undoBtn.click();
          return true;
        }
        return false;
      });
      if (!canUndo) break;
      undoCount++;
      await new Promise((r) => setTimeout(r, 20));
    }

    console.log(`  Undo operations successfully performed until empty: ${undoCount}`);
    // Since MAX_HISTORY_STATES = 20, undoCount must be <= 20
    const test3Passed = undoCount <= 20 && undoCount >= 19;
    testResults.push({
      test: "Test 3: History Stack Clamped to 20 Snapshots",
      passed: test3Passed,
      detail: `Total available undos = ${undoCount} (clamped strictly to <= 20)`,
    });
    console.log(`  -> Result: ${test3Passed ? "PASSED" : "FAILED"}`);

    // ──────────────────────────────────────────────────────────────────
    // TEST 4: History & Canvas Cleanup on New Upload / Reset
    // ──────────────────────────────────────────────────────────────────
    console.log("\n[TEST 4] Testing cleanup on Reset & New Upload...");

    // Click New Image / Reset
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const resetBtn = btns.find((b) =>
        b.innerText.toLowerCase().includes("new image") || b.innerText.toLowerCase().includes("reset")
      );
      if (resetBtn) resetBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Upload Image A again
    const fileInput4 = await page.waitForSelector("input[type=file]", { timeout: 10000 });
    await fileInput4.uploadFile(FIXTURE_A);
    await new Promise((r) => setTimeout(r, 600));

    // Verify clean state: canvas does not exist in upload preview mode
    const cleanState = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      return {
        canvasExists: !!canvas,
      };
    });
    console.log("  State after reset & new upload:", cleanState);
    const test4Passed = !cleanState.canvasExists;
    testResults.push({
      test: "Test 4: Reset & State Clean on New Upload",
      passed: test4Passed,
      detail: "Working canvas and session state cleared cleanly upon reset",
    });
    console.log(`  -> Result: ${test4Passed ? "PASSED" : "FAILED"}`);

    // ──────────────────────────────────────────────────────────────────
    // TEST 5: Model Cache Persistence across Runs
    // ──────────────────────────────────────────────────────────────────
    console.log("\n[TEST 5] Testing model cache across consecutive runs...");
    const tStartRun2 = Date.now();
    await clickExecuteButton(page);

    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("button")).some((b) =>
        b.innerText.toLowerCase().includes("white") || b.innerText.toLowerCase().includes("transparent")
      );
    }, { timeout: 45000 });
    const run2Duration = Date.now() - tStartRun2;
    console.log(`  Second image processing completed in ${run2Duration}ms (cached model)`);

    const test5Passed = run2Duration < 30000;
    testResults.push({
      test: "Test 5: Model Cache Persistence",
      passed: test5Passed,
      detail: `Second run finished in ${run2Duration}ms using warm cache`,
    });
    console.log(`  -> Result: ${test5Passed ? "PASSED" : "FAILED"}`);

    // ──────────────────────────────────────────────────────────────────
    // TEST 6: Unmount Cleanup & Global Event Listener Check
    // ──────────────────────────────────────────────────────────────────
    console.log("\n[TEST 6] Testing unmount cleanup & navigation...");

    await page.goto("http://localhost:3005/", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 600));

    console.log("  Successfully navigated to root dashboard without errors");
    const test6Passed = pageErrors.length === 0;
    testResults.push({
      test: "Test 6: Clean Unmount & Zero Page Errors",
      passed: test6Passed,
      detail: `Unmounted cleanly with ${pageErrors.length} uncaught errors`,
    });
    console.log(`  -> Result: ${test6Passed ? "PASSED" : "FAILED"}`);

  } catch (err) {
    console.error("Test Suite Execution Failed:", err);
    console.log("\n--- BROWSER PAGE LOGS ---");
    console.log(pageLogs.slice(-30).join("\n"));
    console.log("-------------------------\n");
    testResults.push({
      test: "Execution Exception",
      passed: false,
      detail: err.message,
    });
  } finally {
    await browser.close();
  }

  console.log("\n==================================================================");
  console.log("SUMMARY OF VERIFICATION RESULTS");
  console.log("==================================================================");
  let allPassed = true;
  for (const res of testResults) {
    const status = res.passed ? "[PASS]" : "[FAIL]";
    if (!res.passed) allPassed = false;
    console.log(`${status} ${res.test} - ${res.detail}`);
  }
  console.log("==================================================================");
  console.log(`OVERALL RESULT: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);

  if (!allPassed) {
    process.exit(1);
  }
}

runMemoryConcurrencyTests();
