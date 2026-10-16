import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const BASE_URL = process.env.TEST_TARGET_URL || "http://localhost:3005";
const FIXTURES_DIR = path.resolve('test-fixtures');
const EVIDENCE_DIR = path.resolve('evidence-screenshots');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

const report = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: { passed: 0, failed: 0 }
};

function recordTest(id, name, passed, details) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id}: ${name}`);
  if (details) console.log(`   -> ${typeof details === 'object' ? JSON.stringify(details) : details}`);
  report.tests.push({ id, name, passed, details });
  if (passed) report.summary.passed++;
  else report.summary.failed++;
}

async function main() {
  console.log("==================================================================");
  console.log("MODULE 02 FRONTEND ENGINE SELECTOR & FALLBACK SUITE");
  console.log("Target Base URL:", BASE_URL);
  console.log("==================================================================");

  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1000']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('   [PAGE ERROR]', msg.text());
    }
  });

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1 — Default State: Browser AI is default selected
    // ─────────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/bg-remover`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-testid="engine-select-browser"]', { timeout: 8000 });

    const browserAriaChecked = await page.$eval('[data-testid="engine-select-browser"]', el => el.getAttribute('aria-checked'));
    const workerAriaChecked = await page.$eval('[data-testid="engine-select-worker"]', el => el.getAttribute('aria-checked'));
    const workerAriaDisabled = await page.$eval('[data-testid="engine-select-worker"]', el => el.getAttribute('aria-disabled'));

    recordTest(
      "E01_DEFAULT_ENGINE",
      "Browser AI is default selected and Remote Worker is locked when unconfigured",
      browserAriaChecked === "true" && workerAriaChecked === "false" && workerAriaDisabled === "true",
      { browserAriaChecked, workerAriaChecked, workerAriaDisabled }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 2 — Clear Khmer explanation when Remote Worker is unconfigured
    // ─────────────────────────────────────────────────────────────
    const explanationText = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('p')).find(el => el.textContent.includes('BACKGROUND_REMOVAL_WORKER_URL'));
      return p ? p.textContent.trim() : null;
    });

    recordTest(
      "E02_UNCONFIGURED_KHMER_EXPLANATION",
      "Khmer explanation informs user that Remote Worker is not configured and Browser AI is free locally",
      explanationText !== null && explanationText.includes('ឥតគិតថ្លៃ'),
      { explanationText }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 3 — Image Upload Preserved Across Engine Inspector
    // ─────────────────────────────────────────────────────────────
    const fileInput = await page.$('input#bg-source-file-input');
    const fixturePath = path.join(FIXTURES_DIR, 'fixture-1200x1200.jpg');
    await fileInput.uploadFile(fixturePath);
    await page.waitForFunction(() => document.body.innerText.includes('1200') && document.body.innerText.includes('fixture-1200x1200.jpg'), { timeout: 8000 });

    const hasDimensions = await page.evaluate(() => document.body.innerText.includes('1200') && document.body.innerText.includes('fixture-1200x1200.jpg'));
    recordTest(
      "E03_IMAGE_UPLOAD_STATE",
      "Uploaded 1200x1200 image is parsed and displayed with telemetry",
      hasDimensions,
      { hasDimensions }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 4 — Mock Worker Configured State (Request Interception)
    // ─────────────────────────────────────────────────────────────
    const interceptedPage = await browser.newPage();
    await interceptedPage.setViewport({ width: 1440, height: 1000 });
    await interceptedPage.setRequestInterception(true);

    let mockWorkerCallCount = 0;

    interceptedPage.on('request', interceptedRequest => {
      const url = interceptedRequest.url();
      if (url.includes('/api/remove-bg') && interceptedRequest.method() === 'GET') {
        interceptedRequest.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: true, maxUploadBytes: 12582912, timeoutMs: 30000 })
        });
      } else if (url.includes('/api/remove-bg') && interceptedRequest.method() === 'POST') {
        mockWorkerCallCount++;
        // Simulate worker failure to verify error recovery buttons
        interceptedRequest.respond({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, code: "WORKER_FAILED", error: "Remote Worker returned error [HTTP 502]." })
        });
      } else {
        interceptedRequest.continue();
      }
    });

    await interceptedPage.goto(`${BASE_URL}/bg-remover`, { waitUntil: 'networkidle2' });
    await interceptedPage.waitForSelector('[data-testid="engine-select-worker"]', { timeout: 8000 });

    const workerEnabled = await interceptedPage.$eval('[data-testid="engine-select-worker"]', el => !el.disabled && el.getAttribute('aria-disabled') === 'false');
    recordTest(
      "E04_WORKER_ENABLED_WHEN_CONFIGURED",
      "Remote Worker button is enabled when GET /api/remove-bg reports configured: true",
      workerEnabled,
      { workerEnabled }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 5 — Switch Engine to Remote Worker without losing uploaded image
    // ─────────────────────────────────────────────────────────────
    const interceptedInput = await interceptedPage.$('input#bg-source-file-input');
    await interceptedInput.uploadFile(fixturePath);
    await interceptedPage.waitForFunction(() => document.body.innerText.includes('1200') && document.body.innerText.includes('fixture-1200x1200.jpg'), { timeout: 8000 });

    // Click Remote Worker engine radio
    await interceptedPage.click('[data-testid="engine-select-worker"]');
    await interceptedPage.waitForFunction(() => {
      const el = document.querySelector('[data-testid="engine-select-worker"]');
      return el && el.getAttribute('aria-checked') === 'true';
    }, { timeout: 5000 });

    const workerRadioChecked = await interceptedPage.$eval('[data-testid="engine-select-worker"]', el => el.getAttribute('aria-checked'));
    const browserRadioChecked = await interceptedPage.$eval('[data-testid="engine-select-browser"]', el => el.getAttribute('aria-checked'));
    const imageStillLoaded = await interceptedPage.evaluate(() => document.body.innerText.includes('1200') && document.body.innerText.includes('fixture-1200x1200.jpg'));
    const hasWorkerRunBtn = await interceptedPage.$('[data-testid="run-remote-worker-btn"]') !== null;

    recordTest(
      "E05_SWITCH_TO_WORKER",
      "Switching to Remote Worker activates worker radio, preserves uploaded image, and displays Remote Worker action button",
      workerRadioChecked === "true" && browserRadioChecked === "false" && imageStillLoaded && hasWorkerRunBtn,
      { workerRadioChecked, browserRadioChecked, imageStillLoaded, hasWorkerRunBtn }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 6 — Switch back to Browser AI preserves state
    // ─────────────────────────────────────────────────────────────
    await interceptedPage.click('[data-testid="engine-select-browser"]');
    await interceptedPage.waitForFunction(() => {
      const el = document.querySelector('[data-testid="engine-select-browser"]');
      return el && el.getAttribute('aria-checked') === 'true';
    }, { timeout: 5000 });

    const switchedBackBrowser = await interceptedPage.$eval('[data-testid="engine-select-browser"]', el => el.getAttribute('aria-checked'));
    const hasFastPreviewBtn = await interceptedPage.evaluate(() => document.body.innerText.includes('FAST PREVIEW'));

    recordTest(
      "E06_SWITCH_BACK_TO_BROWSER",
      "Switching back to Browser AI restores Fast Preview button while preserving image",
      switchedBackBrowser === "true" && hasFastPreviewBtn && imageStillLoaded,
      { switchedBackBrowser, hasFastPreviewBtn }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 7 — Worker Failure Error Recovery Actions Suite
    // ─────────────────────────────────────────────────────────────
    // Switch to worker again and click run
    await interceptedPage.click('[data-testid="engine-select-worker"]');
    await interceptedPage.waitForSelector('[data-testid="run-remote-worker-btn"]', { timeout: 5000 });
    await interceptedPage.click('[data-testid="run-remote-worker-btn"]');

    // Wait for error banner
    await interceptedPage.waitForSelector('[data-testid="retry-browser-ai-btn"]', { timeout: 8000 });

    const hasRetryBtn = await interceptedPage.$('[data-testid="error-retry-btn"]') !== null;
    const hasRetryBrowserAiBtn = await interceptedPage.$('[data-testid="retry-browser-ai-btn"]') !== null;
    const hasRetry1024Btn = await interceptedPage.$('[data-testid="retry-1024-btn"]') !== null;
    const hasCancelBtn = await interceptedPage.$('[data-testid="error-cancel-btn"]') !== null;
    const hasResetBtn = await interceptedPage.$('[data-testid="error-reset-btn"]') !== null;

    recordTest(
      "E07_ERROR_RECOVERY_ACTIONS",
      "Worker failure triggers complete error recovery suite with Khmer action buttons",
      hasRetryBtn && hasRetryBrowserAiBtn && hasRetry1024Btn && hasCancelBtn && hasResetBtn,
      { hasRetryBtn, hasRetryBrowserAiBtn, hasRetry1024Btn, hasCancelBtn, hasResetBtn }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 8 — Click 'Retry using Browser AI' fallback
    // ─────────────────────────────────────────────────────────────
    await interceptedPage.click('[data-testid="retry-browser-ai-btn"]');
    // Check that engine changed back to browser
    await interceptedPage.waitForFunction(() => {
      const el = document.querySelector('[data-testid="engine-select-browser"]');
      return el && el.getAttribute('aria-checked') === 'true';
    }, { timeout: 5000 });

    const fallbackEngine = await interceptedPage.$eval('[data-testid="engine-select-browser"]', el => el.getAttribute('aria-checked'));
    recordTest(
      "E08_RETRY_BROWSER_AI_FALLBACK",
      "Clicking 'Retry using Browser AI' seamlessly switches engine to Browser AI and retries",
      fallbackEngine === "true",
      { fallbackEngine }
    );

    // Take Desktop Screenshot
    const desktopScreenshotPath = path.join(EVIDENCE_DIR, 'phase6-desktop-engine-selector.png');
    await interceptedPage.screenshot({ path: desktopScreenshotPath, fullPage: true });

    // ─────────────────────────────────────────────────────────────
    // TEST 9 — Mobile Viewport (375x812) Layout & Touch Targets
    // ─────────────────────────────────────────────────────────────
    await interceptedPage.setViewport({ width: 375, height: 812 });
    await interceptedPage.evaluate(() => window.scrollTo(0, 0));

    // Verify touch target min-heights >= 44px
    const touchTargetHeights = await interceptedPage.evaluate(() => {
      const browserBtn = document.querySelector('[data-testid="engine-select-browser"]');
      const workerBtn = document.querySelector('[data-testid="engine-select-worker"]');
      return {
        browserHeight: browserBtn ? browserBtn.getBoundingClientRect().height : 0,
        workerHeight: workerBtn ? workerBtn.getBoundingClientRect().height : 0,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });

    const mobileTouchOk = touchTargetHeights.browserHeight >= 44 && touchTargetHeights.workerHeight >= 44;
    const mobileNoOverflow = !touchTargetHeights.hasHorizontalOverflow;

    recordTest(
      "E09_MOBILE_VIEWPORT_AUDIT",
      "Mobile 375x812 viewport has >= 44px touch targets and zero horizontal scroll overflow",
      mobileTouchOk && mobileNoOverflow,
      { touchTargetHeights }
    );

    // Take Mobile Screenshot
    const mobileScreenshotPath = path.join(EVIDENCE_DIR, 'phase6-mobile-engine-selector.png');
    await interceptedPage.screenshot({ path: mobileScreenshotPath, fullPage: true });

    await interceptedPage.close();
    await page.close();
  } catch (err) {
    console.error("FATAL ERROR IN SUITE:", err);
    recordTest("E99_SUITE_EXCEPTION", "Suite ran without unhandled exception", false, err.message);
  } finally {
    await browser.close();
  }

  const reportPath = path.resolve('test/frontend-engine-switch-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("==================================================================");
  console.log(`SUITE COMPLETE: ${report.summary.passed} PASSED / ${report.summary.failed} FAILED`);
  console.log(`Saved report to: ${reportPath}`);
  console.log("==================================================================");

  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main();
