import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const PREVIEW_URL =
  process.env.PREVIEW_URL ||
  'https://ai-toolkit-mn5mgzsgz-hounsophadayuth2234-6445s-projects.vercel.app/bg-remover';
const FIXTURES_DIR = path.resolve('tests/fixtures');
const SCREENSHOTS_DIR = path.resolve('test-results/redesign-screenshots');

test.describe('AI Background Studio — UI/UX Redesign Visual Verification', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('Capture UI redesign states: empty, modals, light/dark, 375px mobile, processing & masks', async ({
    page,
  }) => {
    // 1. Desktop Empty State (Dark Theme)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PREVIEW_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Verify Untouched Sidebar Elements
    await expect(page.locator('text=PLP Math Content').first()).toBeVisible();
    await expect(page.locator('text=DYT ECOSYSTEM').first()).toBeVisible();
    await expect(page.locator('text=Workspace').first()).toBeVisible();
    await expect(page.locator('text=Active Modules').first()).toBeVisible();
    await expect(page.locator('aside a[href="/bg-remover"]').first()).toBeVisible();
    await expect(page.locator('text=Modules 03–04').first()).toBeVisible();

    // Verify Mechanical Cyber Technology Background & Workstation Controls
    await expect(page.locator('[data-testid="cyber-bg-canvas"]')).toBeVisible();
    await expect(page.locator('text=WORKSTATION // UNIT-02').first()).toBeVisible();
    await expect(page.locator('text=DROP IMAGE INTO SCANNER').first()).toBeVisible();
    await expect(page.locator('text=or choose a file from your device').first()).toBeVisible();
    await expect(page.locator('text=PNG · JPG · WEBP · MAX 12MB').first()).toBeVisible();
    await expect(page.locator('text=PRECISION INSPECTION CHAMBER // STANDBY').first()).toBeVisible();

    // Verify title and nav elements
    await expect(page.locator('text=AI Background Studio').first()).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-01-empty-dark.png'),
      fullPage: false,
    });

    // 2. Help Modal
    const helpBtn = page.locator('[data-testid="help-modal-btn"]');
    await expect(helpBtn).toBeVisible();
    await helpBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-02-help-modal.png'),
      fullPage: false,
    });
    // Close Help Modal
    await page.locator('button:has-text("Got it")').click();
    await page.waitForTimeout(300);

    // 3. Settings Modal
    const settingsBtn = page.locator('[data-testid="settings-modal-btn"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-03-settings-modal.png'),
      fullPage: false,
    });
    // Close Settings Modal
    await page.locator('button:has-text("Done")').click();
    await page.waitForTimeout(300);

    // 4. Light Theme Toggle
    const themeBtn = page.locator('[data-testid="theme-toggle-btn"]');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-04-light-theme.png'),
      fullPage: false,
    });
    // Toggle back to dark theme
    await themeBtn.click();
    await page.waitForTimeout(400);

    // 5. Mobile Viewport (375px iPhone size)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'mobile-01-empty-375px.png'),
      fullPage: true,
    });

    // Reset back to Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    // 6. Upload Poster Fixture
    const fixturePath = path.join(FIXTURES_DIR, 'khmer-poster-eval.png');
    const fileInput = page.locator('[data-testid="image-upload-input"]');
    await fileInput.setInputFiles(fixturePath);

    const removeBtn = page.locator('button:has-text("ដកចេញ (REMOVE)")');
    await expect(removeBtn).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-05-file-uploaded.png'),
      fullPage: false,
    });

    // 7. Select Person + Text Only mode
    const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"]');
    await personTextBtn.click();

    // 8. Run Fast Preview
    const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"]');
    await fastPreviewBtn.click();

    // Capture active processing state
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-06-processing-state.png'),
      fullPage: false,
    });

    // Wait for "Mask is ready" badge
    const statusBadge = page.locator('[data-testid="mask-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 90000 });

    // 9. Desktop Completed State with Previews
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-07-completed-cutout.png'),
      fullPage: false,
    });

    // 10. Person Mask Preview Tab
    const personMaskTab = page.locator('[data-testid="preview-tab-person-mask"]');
    await personMaskTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-08-person-mask-preview.png'),
      fullPage: false,
    });

    // 11. Text Mask Preview Tab
    const textMaskTab = page.locator('[data-testid="preview-tab-text-mask"]');
    await textMaskTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-09-text-mask-preview.png'),
      fullPage: false,
    });

    // 12. Combined Keep Mask Preview Tab
    const combinedMaskTab = page.locator('[data-testid="preview-tab-combined-mask"]');
    await combinedMaskTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'desktop-10-combined-keep-mask.png'),
      fullPage: false,
    });

    // 13. Manual Brush Editor Deck
    const keepBrushBtn = page.locator('[data-testid="tool-keep-brush"]').first();
    if (await keepBrushBtn.isVisible()) {
      await keepBrushBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'desktop-11-brush-editor-active.png'),
        fullPage: false,
      });
    }

    // 14. Mobile Completed Viewport (375px)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'mobile-02-completed-375px.png'),
      fullPage: true,
    });
  });
});
