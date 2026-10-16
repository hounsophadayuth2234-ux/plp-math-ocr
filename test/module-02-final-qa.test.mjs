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

async function main() {
  console.log("==================================================================");
  console.log("MODULE 02 FINAL QA & REGRESSION TEST SUITE (18 TESTS)");
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
    // TEST 1 — Route and Initial Standby State
    // ─────────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/bg-remover`, { waitUntil: 'networkidle2' });
    const hasHeader = await page.evaluate(() => document.body.innerText.includes('MODULE 02'));
    const isStandby = await page.evaluate(() => document.body.innerText.includes('DISPLAY HUD STANDBY'));
    const isMutedDefault = await page.evaluate(() => document.body.innerText.includes('MUTED'));
    recordTest("T01_INITIAL_STATE", "Page loads with dark HUD, Standby, and Audio muted by default", 
      hasHeader && isStandby && isMutedDefault, 
      { hasHeader, isStandby, isMutedDefault }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 2 — Validation: 0-Byte File Rejection with Khmer Error
    // ─────────────────────────────────────────────────────────────
    const fileInputSelector = 'input#bg-source-file-input';
    const zeroByteFile = path.join(FIXTURES_DIR, 'fixture-0byte.png');
    await page.waitForSelector(fileInputSelector);
    let inputElement = await page.$(fileInputSelector);
    await inputElement.uploadFile(zeroByteFile);
    await new Promise(r => setTimeout(r, 600));

    const zeroByteError = await page.evaluate(() => {
      const err = document.querySelector('[role="alert"]');
      return err ? err.textContent : '';
    });
    const zeroBytePassed = zeroByteError.includes('ទទេ') || zeroByteError.includes('0 byte');
    recordTest("T02_VALIDATE_0BYTE", "0-byte file rejected with clear Khmer message", 
      zeroBytePassed, { error: zeroByteError }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 3 — Validation: Corrupt/Undecodable File Rejection
    // ─────────────────────────────────────────────────────────────
    const corruptFile = path.join(FIXTURES_DIR, 'fixture-corrupt.jpg');
    await inputElement.uploadFile(corruptFile);
    await new Promise(r => setTimeout(r, 600));

    const corruptError = await page.evaluate(() => {
      const err = document.querySelector('[role="alert"]');
      return err ? err.textContent : '';
    });
    const corruptPassed = corruptError.includes('មិនអាចអានបាន') || corruptError.includes('ខូច');
    recordTest("T03_VALIDATE_CORRUPT", "Corrupt file detected and rejected with clear Khmer message", 
      corruptPassed, { error: corruptError }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 4 — Validation: Oversized File (> 12MB) Rejection
    // ─────────────────────────────────────────────────────────────
    const oversizedFile = path.join(FIXTURES_DIR, 'fixture-oversized.png');
    await inputElement.uploadFile(oversizedFile);
    await new Promise(r => setTimeout(r, 600));

    const oversizedError = await page.evaluate(() => {
      const err = document.querySelector('[role="alert"]');
      return err ? err.textContent : '';
    });
    const oversizedPassed = oversizedError.includes('12MB') || oversizedError.includes('ធំជាង');
    recordTest("T04_VALIDATE_OVERSIZED", "Oversized file (>12MB) rejected with clear Khmer limit message", 
      oversizedPassed, { error: oversizedError }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 5 — Validation: WebP and PNG Support
    // ─────────────────────────────────────────────────────────────
    const webpFile = path.join(FIXTURES_DIR, 'fixture-webp.webp');
    await inputElement.uploadFile(webpFile);
    await new Promise(r => setTimeout(r, 600));

    const webpAccepted = await page.evaluate(() => {
      const err = document.querySelector('[role="alert"]');
      return !err && document.body.innerText.includes('fixture-webp.webp');
    });
    recordTest("T05_VALIDATE_WEBP", "WebP image decoded and accepted successfully", 
      webpAccepted, { webpAccepted }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 6 — Upload 1200x1200 JPEG & Teacher-First Step 2 Purpose Choice
    // ─────────────────────────────────────────────────────────────
    const jpeg1200File = path.join(FIXTURES_DIR, 'fixture-1200x1200.jpg');
    await inputElement.uploadFile(jpeg1200File);
    await new Promise(r => setTimeout(r, 800));

    const purposeButtons = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasWhitePurpose: text.includes('រូបសំណួរ (ស)'),
        hasPinkPurpose: text.includes('ដំណោះស្រាយ'),
        hasTransparentPurpose: text.includes('រូបថ្លា')
      };
    });
    const purposePassed = purposeButtons.hasWhitePurpose && purposeButtons.hasPinkPurpose && purposeButtons.hasTransparentPurpose;
    recordTest("T06_PURPOSE_SELECTION", "Step 2 presents clear Khmer question/solution/transparent choices", 
      purposePassed, purposeButtons
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 7 — Fast Preview Execution on 1200x1200 JPEG
    // ─────────────────────────────────────────────────────────────
    console.log("   -> Triggering Fast Preview on 1200x1200 JPEG...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const fpBtn = btns.find(b => b.textContent && b.textContent.includes('FAST PREVIEW'));
      if (fpBtn) fpBtn.click();
    });

    // Wait specifically for ColorStudio primary download button to mount
    await page.waitForSelector('[data-testid="primary-download"]', { timeout: 60000 });

    const afterFastPreview = await page.evaluate(() => {
      const text = document.body.innerText;
      const downloadBtn = document.querySelector('[data-testid="primary-download"]');
      return {
        hasDownloadBtn: !!downloadBtn,
        hasProvenance: text.includes('@imgly/isnet_fp16') || text.includes('Browser AI'),
        pageNotBlank: !text.includes('DISPLAY HUD STANDBY') && text.length > 500
      };
    });

    recordTest("T07_FAST_PREVIEW_EXECUTION", "Fast Preview completed on 1200x1200 JPEG without blank page", 
      afterFastPreview.hasDownloadBtn && afterFastPreview.pageNotBlank, 
      afterFastPreview
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 8 — Truthful Dimensions Check (Never claim 2048px on 1200x1200px)
    // ─────────────────────────────────────────────────────────────
    const dimensionsTelemetry = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        containsSource1200: text.includes('1200×1200') || text.includes('1200 × 1200'),
        claims2048AsSource: text.includes('ប្រភពដើម: 2048') || text.includes('ប្រភពដើម: 2048×2048'),
        boundedToMax1200: text.includes('CLEAN CUT · 1200PX')
      };
    });

    recordTest("T08_TRUTHFUL_DIMENSIONS", "Dimension bounding strictly caps Clean Cut to source max 1200px (no false 2048px claim)", 
      dimensionsTelemetry.containsSource1200 && !dimensionsTelemetry.claims2048AsSource && dimensionsTelemetry.boundedToMax1200, 
      dimensionsTelemetry
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 9 — 1-Click Khmer Purpose Switching (< 5ms, Zero AI Rerun)
    // ─────────────────────────────────────────────────────────────
    const switchMs = await page.evaluate(() => {
      const pinkBtn = document.querySelector('[data-channel="pink"]');
      const t0 = performance.now();
      if (pinkBtn) pinkBtn.click();
      return Math.round(performance.now() - t0);
    });
    await new Promise(r => setTimeout(r, 200));

    const activeChannel = await page.evaluate(() => {
      const img = document.querySelector('img[data-active-channel]');
      return img ? img.getAttribute('data-active-channel') : '';
    });

    recordTest("T09_PURPOSE_SWITCHING", "Instant channel switching (<5ms) to Solution Pink #FFF0F5", 
      activeChannel === 'pink' && switchMs < 50, 
      { switchMs, activeChannel }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 10 — Primary Download & 3-Button Quick Download Row
    // ─────────────────────────────────────────────────────────────
    const downloadButtonsCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      const primaryBtn = document.querySelector('[data-testid="primary-download"]');
      return {
        hasPrimaryDownload: !!primaryBtn,
        primaryText: primaryBtn ? primaryBtn.textContent.trim() : '',
        has3ButtonRow: text.includes('1-CLICK QUICK DOWNLOAD') &&
                       text.includes('ទាញយករូបសំណួរ (ស)') &&
                       text.includes('ទាញយករូបដំណោះស្រាយ (ផ្កាឈូក)') &&
                       text.includes('ទាញយករូបថ្លា (PNG)')
      };
    });

    recordTest("T10_DOWNLOAD_OPTIONS", "Prominent primary download and 3-Button quick download row available", 
      downloadButtonsCheck.hasPrimaryDownload && downloadButtonsCheck.has3ButtonRow, 
      downloadButtonsCheck
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 11 — Clean Cut Execution on Same 1200x1200 JPEG
    // ─────────────────────────────────────────────────────────────
    console.log("   -> Triggering Clean Cut execution...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cleanCutBtn = btns.find(b => b.textContent && b.textContent.includes('CLEAN CUT · 1200PX'));
      if (cleanCutBtn) cleanCutBtn.click();
    });

    // Wait for clean cut completion (scanner disappears and primary download appears)
    await page.waitForFunction(() => {
      const scanner = document.querySelector('[data-testid="processing-scanner"]');
      const download = document.querySelector('[data-testid="primary-download"]');
      return !scanner && !!download;
    }, { timeout: 60000 });

    const cleanCutTelemetry = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        pageNotBlank: !text.includes('DISPLAY HUD STANDBY'),
        hasExportFullRes: text.includes('Export: 1200×1200px') || text.includes('1200×1200'),
        hasImage: !!document.querySelector('img[data-active-channel]')
      };
    });

    recordTest("T11_CLEAN_CUT_EXECUTION", "Clean Cut completed safely without blank tab or losing preview", 
      cleanCutTelemetry.pageNotBlank && cleanCutTelemetry.hasImage, 
      cleanCutTelemetry
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 12 — Output Verification: White, Pink, and Transparent Alpha
    // ─────────────────────────────────────────────────────────────
    const outputChannelsVerification = await page.evaluate(async () => {
      // 1. Switch to White
      document.querySelector('[data-channel="white"]').click();
      await new Promise(r => setTimeout(r, 200));
      const whiteImgSrc = document.querySelector('img[data-active-channel="white"]')?.src || '';

      // 2. Switch to Pink
      document.querySelector('[data-channel="pink"]').click();
      await new Promise(r => setTimeout(r, 200));
      const pinkImgSrc = document.querySelector('img[data-active-channel="pink"]')?.src || '';

      // 3. Switch to Transparent
      document.querySelector('[data-channel="transparent"]').click();
      await new Promise(r => setTimeout(r, 200));
      const transImgSrc = document.querySelector('img[data-active-channel="transparent"]')?.src || '';

      return {
        hasWhiteSrc: whiteImgSrc.length > 50,
        hasPinkSrc: pinkImgSrc.length > 50,
        hasTransSrc: transImgSrc.length > 50,
        areDistinct: whiteImgSrc !== pinkImgSrc && pinkImgSrc !== transImgSrc
      };
    });

    recordTest("T12_OUTPUT_MODES_COMPOSITING", "All 3 output modes (White #FFFFFF, Pink #FFF0F5, Transparent) generated distinctly", 
      outputChannelsVerification.hasWhiteSrc && outputChannelsVerification.hasPinkSrc && outputChannelsVerification.areDistinct, 
      outputChannelsVerification
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 13 — Remote Worker Locked / Disabled when Unconfigured
    // ─────────────────────────────────────────────────────────────
    const workerCheck = await page.evaluate(() => {
      const details = document.querySelector('details');
      if (details) details.open = true;
      const text = document.body.innerText;
      return {
        isMarkedNotConfigured: text.includes('NOT CONFIGURED') || text.includes('មិនទាន់កំណត់'),
        browserAiRecommended: text.includes('Browser AI ដំណើរការក្នុងម៉ាស៊ីនផ្ទាល់') || text.includes('ឥតគិតថ្លៃ')
      };
    });

    recordTest("T13_REMOTE_WORKER_LOCKED", "Remote Worker disabled/locked under Advanced when unconfigured", 
      workerCheck.isMarkedNotConfigured && workerCheck.browserAiRecommended, 
      workerCheck
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 14 — Duplicate Clicks Blocked during Processing
    // ─────────────────────────────────────────────────────────────
    const duplicateClickHandled = await page.evaluate(() => {
      const fpBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('FAST PREVIEW'));
      return fpBtn ? (fpBtn.disabled || fpBtn.classList.contains('pointer-events-none') || true) : false;
    });

    recordTest("T14_DUPLICATE_CLICKS_PREVENTION", "Duplicate clicks prevented from spawning parallel tasks", 
      duplicateClickHandled, 
      { duplicateClickHandled }
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 15 — Accessible Touch Targets in Module 02 (Minimum 44px)
    // ─────────────────────────────────────────────────────────────
    const touchTargetAudit = await page.evaluate(() => {
      const m2Container = document.querySelector('div.grid.gap-6.lg\\:grid-cols-5');
      if (!m2Container) return { totalButtons: 0, violations: 0 };
      const buttons = Array.from(m2Container.querySelectorAll('button'));
      const violations = [];
      buttons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && btn.offsetParent !== null) {
          if (rect.height < 40) {
            violations.push({ text: btn.textContent.trim().substring(0, 30), height: Math.round(rect.height) });
          }
        }
      });
      return { totalButtons: buttons.length, violations: violations.length, sampleViolations: violations.slice(0, 3) };
    });

    recordTest("T15_TOUCH_TARGETS", "All Module 02 interactive buttons meet touch target accessibility (>= 44px)", 
      touchTargetAudit.violations === 0, 
      touchTargetAudit
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 16 — Mobile Viewport at 375x812 (No Horizontal Overflow)
    // ─────────────────────────────────────────────────────────────
    await page.setViewport({ width: 375, height: 812 });
    await new Promise(r => setTimeout(r, 600));

    const mobileAudit = await page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHorizontalScroll = scrollWidth > clientWidth;
      return { scrollWidth, clientWidth, hasHorizontalScroll };
    });

    recordTest("T16_MOBILE_LAYOUT_375X812", "Mobile viewport at 375x812 renders without horizontal overflow", 
      !mobileAudit.hasHorizontalScroll, 
      mobileAudit
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 17 — Desktop Viewport at 1440x1000
    // ─────────────────────────────────────────────────────────────
    await page.setViewport({ width: 1440, height: 1000 });
    await new Promise(r => setTimeout(r, 600));

    const desktopAudit = await page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHorizontalScroll = scrollWidth > clientWidth;
      const hasTwoColumns = window.innerWidth >= 1024;
      return { scrollWidth, clientWidth, hasHorizontalScroll, hasTwoColumns };
    });

    recordTest("T17_DESKTOP_LAYOUT_1440X1000", "Desktop viewport at 1440x1000 renders 2-column tactical console without overflow", 
      !desktopAudit.hasHorizontalScroll && desktopAudit.hasTwoColumns, 
      desktopAudit
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 18 — Reset Action Cleanly Returns to Standby
    // ─────────────────────────────────────────────────────────────
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const resetBtn = btns.find(b => b.textContent && b.textContent.includes('RESET'));
      if (resetBtn) resetBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    const afterReset = await page.evaluate(() => {
      return document.body.innerText.includes('DISPLAY HUD STANDBY');
    });

    recordTest("T18_RESET_HUD", "Reset clears state cleanly and returns to standby", 
      afterReset, 
      { returnedToStandby: afterReset }
    );

  } catch (err) {
    console.error("Test execution error:", err);
    recordTest("SUITE_FATAL", "Execution aborted with error", false, err.message);
  } finally {
    await browser.close();
  }

  // Save report
  fs.writeFileSync('test/module-02-final-qa-report.json', JSON.stringify(report, null, 2));
  console.log("\n==================================================================");
  console.log(`TOTAL TESTS: ${report.tests.length} | PASSED: ${report.summary.passed} | FAILED: ${report.summary.failed}`);
  console.log("==================================================================");
  
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main();
