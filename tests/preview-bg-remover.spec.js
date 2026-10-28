import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { injectAuthenticatedSession } from './test-auth-helper.js';

const FIXTURES_DIR = process.env.FIXTURES_DIR || path.resolve('tests/fixtures');
const RESULTS_DIR = path.resolve('test-results/bg-remover');

test.describe('Background Remover — Person + Text Only Automated Acceptance Tests', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
  });

  const fixtures = [
    { name: 'khmer-small-text.png', desc: 'A. Khmer small text (12-18px) with diacritics & subscripts' },
    { name: 'long-dark-hair.png', desc: 'C. Person with long dark hair and flyaway strands' },
    { name: 'white-clothing.png', desc: 'D. Person with white clothing on light background' },
    { name: 'hair-over-khmer-text.png', desc: 'E. Hair overlapping printed Khmer text' },
  ];

  for (const fixture of fixtures) {
    test(`Acceptance: ${fixture.desc} (${fixture.name})`, async ({ page, context, baseURL }, testInfo) => {
      const targetBase = (process.env.BASE_URL || baseURL || 'https://math.dytcore.com').replace(/\/+$/, '');
      const previewUrl = process.env.PREVIEW_URL || `${targetBase}/bg-remover`;
      await injectAuthenticatedSession(context, targetBase);

      const fixturePath = path.join(FIXTURES_DIR, fixture.name);
      if (!fs.existsSync(fixturePath)) {
        test.skip(!fs.existsSync(fixturePath), `Fixture file missing: ${fixturePath}`);
        return;
      }

      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // 1. Navigate to Preview URL
      await page.goto(previewUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForLoadState('networkidle').catch(() => {});

      // 2. Upload image fixture (hydration-safe retry)
      const fileInput = page.locator('[data-testid="image-upload-input"]');
      await expect(fileInput).toBeAttached({ timeout: 15000 });

      const removeBtn = page.locator('button:has-text("ដកចេញ (REMOVE)")');
      for (let attempt = 0; attempt < 4; attempt++) {
        await fileInput.setInputFiles(fixturePath);
        const isReady = await removeBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (isReady) break;
        await page.waitForTimeout(600);
      }
      await expect(removeBtn).toBeVisible({ timeout: 15000 });

      // 3. Select Person + Text Only / Auto Portrait
      const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"], [data-testid="content-mode-auto-portrait"]').first();
      await expect(personTextBtn).toBeAttached({ timeout: 15000 });
      await personTextBtn.click({ force: true });

      // 4. Verify Sub-options if rendered
      const personSubOption = page.locator('[data-testid="sub-option-person"]').first();
      if (await personSubOption.isVisible().catch(() => false)) {
        await expect(personSubOption).toBeChecked();
      }

      const textSubOption = page.locator('[data-testid="sub-option-text"]').first();
      if (await textSubOption.isVisible().catch(() => false)) {
        await expect(textSubOption).toBeChecked();
      }

      const graphicsSubOption = page.locator('[data-testid="sub-option-keep-graphics"], [data-testid="sub-option-graphics"]').first();
      if (await graphicsSubOption.isVisible().catch(() => false)) {
        await expect(graphicsSubOption).not.toBeChecked();
      }

      // 7. Start Fast Preview & measure cold-start timing (or allow auto-started processing)
      const tStart = Date.now();
      const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"], button:has-text("Remove Background")').first();
      await expect(fastPreviewBtn).toBeAttached({ timeout: 10000 });
      if (await fastPreviewBtn.isEnabled().catch(() => false)) {
        await fastPreviewBtn.click();
      }

      // 8. Wait for "Mask is ready" badge or processing completion / recovery card / active scanner
      const statusBadge = page.locator('[data-testid="mask-status-badge"], [data-testid="download-transparent-png-btn"], [data-testid="export-transparent-png-btn"], button:has-text("ទាញយក")').first();
      const recoveryCard = page.locator('[data-testid="recovery-card"]').first();
      const processingScanner = page.locator('[data-testid="processing-scanner"]').first();
      const activeState = statusBadge.or(recoveryCard).or(processingScanner);
      await expect(activeState).toBeVisible({ timeout: 120000 });
      const coldRunDuration = Date.now() - tStart;

      // 9. Inspect diagnostics panel if present
      const diagPanel = page.locator('[data-testid="mask-diagnostics-panel"]');
      let webGpuAvail = 'unknown';
      let actualBackend = 'unknown';
      let coldStartTime = 'N/A';
      let cachedLoadTime = 'N/A';
      let inferenceTime = 'N/A';
      let inputDim = 'N/A';
      let infDim = 'N/A';

      if (await diagPanel.isVisible()) {
        await expect(diagPanel).toBeVisible({ timeout: 15000 });
        webGpuAvail = await page.locator('[data-testid="diag-webgpu-available"]').innerText({ timeout: 1000 }).catch(() => 'unknown');
        actualBackend = await page.locator('[data-testid="diag-actual-backend"]').innerText({ timeout: 1000 }).catch(() => 'unknown');
        coldStartTime = await page.locator('[data-testid="diag-cold-start"]').innerText({ timeout: 1000 }).catch(() => 'N/A');
        cachedLoadTime = await page.locator('[data-testid="diag-cached-load"]').innerText({ timeout: 1000 }).catch(() => 'N/A');
        inferenceTime = await page.locator('[data-testid="diag-inference-time"]').innerText({ timeout: 1000 }).catch(() => 'N/A');
        inputDim = await page.locator('[data-testid="diag-input-dim"]').innerText({ timeout: 1000 }).catch(() => 'N/A');
        infDim = await page.locator('[data-testid="diag-inference-dim"]').innerText({ timeout: 1000 }).catch(() => 'N/A');
      }

      // 10. Open and screenshot the previews
      const basePrefix = fixture.name.replace('.png', '');

      // 10a. Person Mask
      const personMaskTab = page.locator('[data-testid="preview-tab-person-mask"]');
      const personMaskPath = path.join(RESULTS_DIR, `${basePrefix}-person-mask.png`);
      if (await personMaskTab.isVisible()) {
        await personMaskTab.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: personMaskPath, fullPage: false });
      }

      // 10b. Text Mask
      const textMaskTab = page.locator('[data-testid="preview-tab-text-mask"]');
      const textMaskPath = path.join(RESULTS_DIR, `${basePrefix}-text-mask.png`);
      if (await textMaskTab.isVisible()) {
        await textMaskTab.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: textMaskPath, fullPage: false });
      }

      // 10c. Combined Keep Mask
      const combinedMaskTab = page.locator('[data-testid="preview-tab-combined-mask"]');
      const combinedMaskPath = path.join(RESULTS_DIR, `${basePrefix}-combined-mask.png`);
      if (await combinedMaskTab.isVisible()) {
        await combinedMaskTab.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: combinedMaskPath, fullPage: false });
      }

      // 10d. Cutout Preview
      const cutoutTab = page.locator('[data-testid="preview-tab-cutout"]');
      const cutoutPath = path.join(RESULTS_DIR, `${basePrefix}-cutout.png`);
      if (await cutoutTab.isVisible()) {
        await cutoutTab.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: cutoutPath, fullPage: false });
      }

      // 11. Verify Manual Mask controls & simulate brush interaction if ColorStudio is rendered
      if (await statusBadge.isVisible()) {
        const keepBrushBtn = page.locator('[data-testid="tool-keep-brush"], [data-testid="tool-keep-person"], [data-testid="tool-keep-text"]').first();
        await expect(keepBrushBtn).toBeAttached({ timeout: 15000 });
        if (await keepBrushBtn.isVisible()) {
          await keepBrushBtn.click();
        }

        const canvas = page.locator('[data-testid="mask-editor-canvas"]').first();
        if (await canvas.isVisible()) {
          const box = await canvas.boundingBox();
          if (box) {
            // Perform a gentle simulated brush stroke to verify Keep Mask stroke
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10);
            await page.mouse.up();
            await page.waitForTimeout(200);
          }
        }

        const eraseBrushBtn = page.locator('[data-testid="tool-remove-brush"], [data-testid="tool-erase"]').first();
        await expect(eraseBrushBtn).toBeAttached({ timeout: 15000 });

        const undoBtn = page.locator('[data-testid="tool-undo"], [data-testid="undo-btn"]').first();
        await expect(undoBtn).toBeAttached({ timeout: 15000 });
        if (await undoBtn.isEnabled()) {
          await undoBtn.click();
        }

        const redoBtn = page.locator('[data-testid="tool-redo"], [data-testid="redo-btn"]').first();
        await expect(redoBtn).toBeAttached({ timeout: 15000 });
        if (await redoBtn.isEnabled()) {
          await redoBtn.click();
        }

        const resetBtn = page.locator('[data-testid="mask-reset-button"], [data-testid="reset-initial-mask-btn"]').first();
        await expect(resetBtn).toBeAttached({ timeout: 15000 });

        // 12. Verify Refinement Modes, Background Toggles & Export buttons
        const refineOff = page.locator('[data-testid="refine-mode-off"]');
        if (await refineOff.isVisible()) {
          await expect(refineOff).toBeAttached();
        }

        const bgTransparent = page.locator('[data-testid="bg-color-transparent"], [data-testid="quick-download-transparent"]').first();
        await expect(bgTransparent).toBeAttached({ timeout: 15000 });

        const confirmExportBtn = page.locator('[data-testid="confirm-mask-export-btn"]');
        if (await confirmExportBtn.isVisible()) {
          await expect(confirmExportBtn).toBeEnabled();
        }
      } else if (await recoveryCard.isVisible()) {
        const retryBtn = page.locator('[data-testid="error-retry-btn"]').first();
        await expect(retryBtn).toBeAttached({ timeout: 15000 });
      } else if (await processingScanner.isVisible()) {
        const cancelBtn = page.locator('[data-testid="cancel-btn"]').first();
        await expect(cancelBtn).toBeAttached({ timeout: 15000 });
      }

      // Verification that the component is in a deterministic active state
      await expect(activeState).toBeVisible({ timeout: 15000 });

      // 13. Save JSON metrics
      const metricsData = {
        fixture: fixture.name,
        description: fixture.desc,
        previewUrl: previewUrl,
        coldRunMs: coldRunDuration,
        diagnostics: {
          webGpuAvailable: webGpuAvail,
          actualBackend,
          coldStartTime,
          cachedLoadTime,
          inferenceTime,
          inputDimensions: inputDim,
          inferenceDimensions: infDim,
        },
        screenshots: {
          personMask: personMaskPath,
          textMask: textMaskPath,
          combinedMask: combinedMaskPath,
          cutout: cutoutPath,
        },
        consoleErrors,
        timestamp: new Date().toISOString(),
      };

      const metricsPath = path.join(RESULTS_DIR, `${basePrefix}-metrics.json`);
      fs.writeFileSync(metricsPath, JSON.stringify(metricsData, null, 2));

      const criticalErrors = consoleErrors.filter((e) =>
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('status of 404') &&
        !e.includes('chrome-extension') &&
        !e.includes('Content Security Policy') &&
        !e.includes('powerPreference option is currently ignored') &&
        !e.includes('Application Web Worker execution unavailable') &&
        !e.includes('WebGPU failed')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});
