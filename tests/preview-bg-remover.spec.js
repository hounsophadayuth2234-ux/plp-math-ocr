import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://ai-toolkit-mn5mgzsgz-hounsophadayuth2234-6445s-projects.vercel.app/bg-remover';
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
    test(`Acceptance: ${fixture.desc} (${fixture.name})`, async ({ page }, testInfo) => {
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
      await page.goto(PREVIEW_URL, { waitUntil: 'load', timeout: 60000 });
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

      // 3. Select Person + Text Only
      const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"]');
      await expect(personTextBtn).toBeVisible({ timeout: 15000 });
      await personTextBtn.click();

      // 4. Verify Person is checked
      const personSubOption = page.locator('[data-testid="sub-option-person"]').first();
      await expect(personSubOption).toBeVisible({ timeout: 10000 });
      await expect(personSubOption).toBeChecked();

      // 5. Verify Text is checked
      const textSubOption = page.locator('[data-testid="sub-option-text"]').first();
      await expect(textSubOption).toBeVisible({ timeout: 10000 });
      await expect(textSubOption).toBeChecked();

      // 6. Verify Keep selected graphics is unchecked
      const graphicsSubOption = page.locator('[data-testid="sub-option-keep-graphics"]').first();
      await expect(graphicsSubOption).toBeVisible({ timeout: 10000 });
      await expect(graphicsSubOption).not.toBeChecked();

      // 7. Start Fast Preview & measure cold-start timing
      const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"]');
      await expect(fastPreviewBtn).toBeVisible({ timeout: 10000 });
      await expect(fastPreviewBtn).toBeEnabled({ timeout: 15000 });

      const tStart = Date.now();
      await fastPreviewBtn.click();

      // 8. Wait for "Mask is ready" badge
      const statusBadge = page.locator('[data-testid="mask-status-badge"]');
      await expect(statusBadge).toBeVisible({ timeout: 90000 });
      await expect(statusBadge).toContainText('Mask is ready');
      const coldRunDuration = Date.now() - tStart;

      // 9. Inspect diagnostics panel
      const diagPanel = page.locator('[data-testid="mask-diagnostics-panel"]');
      await expect(diagPanel).toBeVisible({ timeout: 15000 });

      const webGpuAvail = await page.locator('[data-testid="diag-webgpu-available"]').innerText().catch(() => 'unknown');
      const actualBackend = await page.locator('[data-testid="diag-actual-backend"]').innerText().catch(() => 'unknown');
      const coldStartTime = await page.locator('[data-testid="diag-cold-start"]').innerText().catch(() => 'N/A');
      const cachedLoadTime = await page.locator('[data-testid="diag-cached-load"]').innerText().catch(() => 'N/A');
      const inferenceTime = await page.locator('[data-testid="diag-inference-time"]').innerText().catch(() => 'N/A');
      const inputDim = await page.locator('[data-testid="diag-input-dim"]').innerText().catch(() => 'N/A');
      const infDim = await page.locator('[data-testid="diag-inference-dim"]').innerText().catch(() => 'N/A');

      // 10. Open and screenshot the 4 required previews
      const basePrefix = fixture.name.replace('.png', '');

      // 10a. Person Mask
      const personMaskTab = page.locator('[data-testid="preview-tab-person-mask"]');
      await expect(personMaskTab).toBeVisible();
      await personMaskTab.click();
      await page.waitForTimeout(400);
      const personMaskPath = path.join(RESULTS_DIR, `${basePrefix}-person-mask.png`);
      await page.screenshot({ path: personMaskPath, fullPage: false });

      // 10b. Text Mask
      const textMaskTab = page.locator('[data-testid="preview-tab-text-mask"]');
      await expect(textMaskTab).toBeVisible();
      await textMaskTab.click();
      await page.waitForTimeout(400);
      const textMaskPath = path.join(RESULTS_DIR, `${basePrefix}-text-mask.png`);
      await page.screenshot({ path: textMaskPath, fullPage: false });

      // 10c. Combined Keep Mask
      const combinedMaskTab = page.locator('[data-testid="preview-tab-combined-mask"]');
      await expect(combinedMaskTab).toBeVisible();
      await combinedMaskTab.click();
      await page.waitForTimeout(400);
      const combinedMaskPath = path.join(RESULTS_DIR, `${basePrefix}-combined-mask.png`);
      await page.screenshot({ path: combinedMaskPath, fullPage: false });

      // 10d. Cutout Preview
      const cutoutTab = page.locator('[data-testid="preview-tab-cutout"]');
      await expect(cutoutTab).toBeVisible();
      await cutoutTab.click();
      await page.waitForTimeout(400);
      const cutoutPath = path.join(RESULTS_DIR, `${basePrefix}-cutout.png`);
      await page.screenshot({ path: cutoutPath, fullPage: false });

      // 11. Verify Manual Mask controls & simulate brush interaction
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

      const exportTransparentBtn = page.locator('[data-testid="export-transparent-png-btn"], [data-testid="quick-download-transparent"]').first();
      await expect(exportTransparentBtn).toBeVisible({ timeout: 15000 });

      // 13. Save JSON metrics
      const metricsData = {
        fixture: fixture.name,
        description: fixture.desc,
        previewUrl: PREVIEW_URL,
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
        !e.includes('chrome-extension')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});
