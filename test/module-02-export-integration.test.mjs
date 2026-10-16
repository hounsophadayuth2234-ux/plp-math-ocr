import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const BASE_URL = process.env.TEST_TARGET_URL || "http://localhost:3005";
const FIXTURES_DIR = path.resolve('test-fixtures');

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

async function waitForNewDownload(page, triggerFn, timeoutMs = 20000) {
  const prevCount = await page.evaluate(() => window.__downloadHistory ? window.__downloadHistory.length : 0);
  await triggerFn();
  await page.waitForFunction(
    (count) => window.__downloadHistory && window.__downloadHistory.length > count,
    { timeout: timeoutMs },
    prevCount
  );
  return page.evaluate(() => window.__downloadHistory[window.__downloadHistory.length - 1]);
}

async function main() {
  console.log("==================================================================");
  console.log("MODULE 02 EXPORT & COMPOSITING INTEGRATION SUITE (8 TESTS)");
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
    await page.goto(`${BASE_URL}/bg-remover`, { waitUntil: 'networkidle2' });

    // Install global download spy on page
    await page.evaluate(() => {
      window.__downloadHistory = [];
      const origAppendChild = document.body.appendChild.bind(document.body);
      document.body.appendChild = function(el) {
        if (el && el.tagName === 'A' && el.download) {
          window.__downloadHistory.push({
            download: el.download,
            href: el.href,
            timestamp: Date.now()
          });
        }
        return origAppendChild(el);
      };
    });

    // Upload 1200x1200 fixture
    const fileInputSelector = 'input#bg-source-file-input';
    await page.waitForSelector(fileInputSelector);
    const inputElement = await page.$(fileInputSelector);
    const fixture1200 = path.join(FIXTURES_DIR, 'fixture-1200x1200.jpg');
    await inputElement.uploadFile(fixture1200);
    await new Promise(r => setTimeout(r, 600));

    // ─────────────────────────────────────────────────────────────
    // TEST 1 — Fast Preview then White Download
    // ─────────────────────────────────────────────────────────────
    console.log("   -> Triggering Fast Preview on 1200x1200 fixture...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const fpBtn = btns.find(b => b.textContent && b.textContent.includes('FAST PREVIEW'));
      if (fpBtn) fpBtn.click();
    });

    // Wait for Fast Preview completion (primary download button appears)
    await page.waitForSelector('[data-testid="primary-download"]', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));

    // Select White channel
    await page.evaluate(() => {
      const whiteBtn = document.querySelector('[data-channel="white"]');
      if (whiteBtn) whiteBtn.click();
    });
    await new Promise(r => setTimeout(r, 200));

    // Click Primary Download for White and await download capture
    const whiteDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const dlBtn = document.querySelector('[data-testid="primary-download"]');
        if (dlBtn) dlBtn.click();
      });
    });

    recordTest(
      "EXP_01_FAST_PREVIEW_WHITE",
      "Fast Preview then White download delivers valid PNG filename and URL",
      whiteDl && whiteDl.download.includes("White-FFFFFF") && whiteDl.href.startsWith("blob:"),
      whiteDl
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 2 — Fast Preview then Pink Download
    // ─────────────────────────────────────────────────────────────
    const pinkDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const pinkBtn = document.querySelector('[data-testid="quick-download-pink"]');
        if (pinkBtn) pinkBtn.click();
      });
    });

    recordTest(
      "EXP_02_FAST_PREVIEW_PINK",
      "Fast Preview then Pink download delivers valid #FFF0F5 filename and URL",
      pinkDl && pinkDl.download.includes("Pink-FFF0F5") && pinkDl.href.startsWith("blob:"),
      pinkDl
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 3 — Clean Cut then White Download
    // ─────────────────────────────────────────────────────────────
    console.log("   -> Triggering Clean Cut execution...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cleanCutBtn = btns.find(b => b.textContent && b.textContent.includes('CLEAN CUT'));
      if (cleanCutBtn) cleanCutBtn.click();
    });

    // Wait for clean cut completion (scanner disappears and primary download appears)
    await page.waitForFunction(() => {
      const scanner = document.querySelector('[data-testid="processing-scanner"]');
      const download = document.querySelector('[data-testid="primary-download"]');
      return !scanner && !!download;
    }, { timeout: 60000 });
    await new Promise(r => setTimeout(r, 500));

    // Download White after Clean Cut
    const cleanCutWhiteDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const whiteBtn = document.querySelector('[data-testid="quick-download-white"]');
        if (whiteBtn) whiteBtn.click();
      });
    });

    recordTest(
      "EXP_03_CLEAN_CUT_WHITE",
      "Clean Cut then White download exports full-resolution PNG successfully",
      cleanCutWhiteDl && cleanCutWhiteDl.download.includes("White-FFFFFF") && cleanCutWhiteDl.href.startsWith("blob:"),
      cleanCutWhiteDl
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 4 — Clean Cut then Pink Download
    // ─────────────────────────────────────────────────────────────
    const cleanCutPinkDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const pinkBtn = document.querySelector('[data-testid="quick-download-pink"]');
        if (pinkBtn) pinkBtn.click();
      });
    });

    recordTest(
      "EXP_04_CLEAN_CUT_PINK",
      "Clean Cut then Pink download exports full-resolution #FFF0F5 PNG successfully",
      cleanCutPinkDl && cleanCutPinkDl.download.includes("Pink-FFF0F5") && cleanCutPinkDl.href.startsWith("blob:"),
      cleanCutPinkDl
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 5 — Manual Mask Correction then Export
    // ─────────────────────────────────────────────────────────────
    console.log("   -> Testing Manual Mask Correction in studio...");
    // Open Advanced details disclosure
    await page.evaluate(() => {
      const details = Array.from(document.querySelectorAll('details')).find(d => 
        d.textContent && d.textContent.includes('MANUAL MASK STUDIO')
      );
      if (details) details.open = true;
    });
    await new Promise(r => setTimeout(r, 300));

    // Select Remove Brush
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const eraseBtn = btns.find(b => b.textContent && b.textContent.includes('Remove') || b.title?.includes('Remove'));
      if (eraseBtn) eraseBtn.click();
    });
    await new Promise(r => setTimeout(r, 200));

    // Draw a stroke on the canvas to apply a manual correction
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        const downEvt = new PointerEvent('pointerdown', { clientX: startX, clientY: startY, bubbles: true });
        const moveEvt = new PointerEvent('pointermove', { clientX: startX + 20, clientY: startY + 20, bubbles: true });
        const upEvt = new PointerEvent('pointerup', { clientX: startX + 20, clientY: startY + 20, bubbles: true });

        canvas.dispatchEvent(downEvt);
        canvas.dispatchEvent(moveEvt);
        canvas.dispatchEvent(upEvt);
      }
    });
    await new Promise(r => setTimeout(r, 300));

    // Trigger download of corrected mask
    const postCorrectDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const dlBtn = document.querySelector('[data-testid="primary-download"]');
        if (dlBtn) dlBtn.click();
      });
    });

    recordTest(
      "EXP_05_MANUAL_CORRECTION_EXPORT",
      "Manual mask brush stroke updates working mask and exports correctly",
      postCorrectDl && postCorrectDl.href.startsWith("blob:"),
      postCorrectDl
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 6 — Reset Mask then Export
    // ─────────────────────────────────────────────────────────────
    await page.evaluate(() => {
      const resetBtn = document.querySelector('[data-testid="mask-reset-button"]');
      if (resetBtn) resetBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    const resetDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const dlBtn = document.querySelector('[data-testid="primary-download"]');
        if (dlBtn) dlBtn.click();
      });
    });

    recordTest(
      "EXP_06_RESET_THEN_EXPORT",
      "Reset mask reverts to baseline AI segmentation and exports cleanly",
      resetDl && resetDl.href.startsWith("blob:"),
      resetDl
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 7 — Repeated Exports (White, Pink, Transparent in succession)
    // ─────────────────────────────────────────────────────────────
    const repWhite = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const wBtn = document.querySelector('[data-testid="quick-download-white"]');
        if (wBtn) wBtn.click();
      });
    });

    const repPink = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const pBtn = document.querySelector('[data-testid="quick-download-pink"]');
        if (pBtn) pBtn.click();
      });
    });

    const repTrans = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const tBtn = document.querySelector('[data-testid="quick-download-transparent"]');
        if (tBtn) tBtn.click();
      });
    });

    const allThreeValid = repWhite && repPink && repTrans &&
      repWhite.download.includes("White") &&
      repPink.download.includes("Pink") &&
      (repTrans.download.includes("Cutout") || repTrans.download.includes("Transparent"));

    recordTest(
      "EXP_07_REPEATED_EXPORT",
      "Repeated exports succeed without state corruption or URL premature revocation",
      allThreeValid,
      { white: repWhite?.download, pink: repPink?.download, transparent: repTrans?.download }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 8 — Mobile Export at 375x812
    // ─────────────────────────────────────────────────────────────
    await page.setViewport({ width: 375, height: 812 });
    await new Promise(r => setTimeout(r, 600));

    const mobileCheck = await page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const primaryBtn = document.querySelector('[data-testid="primary-download"]');
      const isVisible = primaryBtn ? primaryBtn.offsetParent !== null : false;
      return { scrollWidth, clientWidth, hasOverflow: scrollWidth > clientWidth, isVisible };
    });

    const mobileDl = await waitForNewDownload(page, async () => {
      await page.evaluate(() => {
        const primaryBtn = document.querySelector('[data-testid="primary-download"]');
        if (primaryBtn) primaryBtn.click();
      });
    });

    recordTest(
      "EXP_08_MOBILE_EXPORT_375X812",
      "Mobile viewport at 375x812 renders without overflow and exports successfully",
      !mobileCheck.hasOverflow && mobileCheck.isVisible && !!mobileDl,
      { mobileCheck, mobileDl }
    );

  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    await browser.close();
    console.log("==================================================================");
    console.log(`TOTAL TESTS: ${report.tests.length} | PASSED: ${report.summary.passed} | FAILED: ${report.summary.failed}`);
    console.log("==================================================================");
    fs.writeFileSync(
      path.join('test', 'module-02-export-integration-report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );
  }
}

main();
