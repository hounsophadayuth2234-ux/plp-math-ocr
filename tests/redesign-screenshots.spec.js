import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { injectAuthenticatedSession } from './test-auth-helper.js';

const getBaseUrl = (baseURL) =>
  (process.env.BASE_URL || process.env.PREVIEW_URL || baseURL || 'https://math.dytcore.com').replace(/\/+$/, '');
const FIXTURES_DIR = path.resolve('tests/fixtures');
const SCREENSHOTS_DIR = path.resolve('test-results/redesign-screenshots');

test.describe('Mechanical Cyber Technology — 3-Page Visual & Layout Verification', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ context, baseURL }) => {
    const target = getBaseUrl(baseURL);
    await injectAuthenticatedSession(context, target);
  });

  test('Page 1: Dashboard (/) Command Center - 1440px and 375px', async ({ page, baseURL }) => {
    const targetBase = getBaseUrl(baseURL);
    // 1. Desktop 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${targetBase}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Verify Untouched Sidebar Elements
    await expect(page.locator('text=PLP Math Content').first()).toBeVisible();
    await expect(page.locator('text=DYT ECOSYSTEM').first()).toBeVisible();
    await expect(page.locator('text=Workspace').first()).toBeVisible();
    await expect(page.locator('text=Active Modules').first()).toBeVisible();
    await expect(page.locator('aside a[href="/bg-remover"]').first()).toBeVisible();
    await expect(page.locator('text=Modules 03–04').first()).toBeVisible();

    // Verify Global Mechanical Cyber Background
    await expect(page.locator('[data-testid="cyber-bg-canvas"]')).toBeVisible();

    // Verify Dashboard Operational Command Center Elements
    await expect(page.locator('text=DYT AI WORKSPACE').first()).toBeVisible();
    await expect(page.locator('text=COMMAND CENTER').first()).toBeVisible();
    await expect(page.locator('h2:has-text("PLP Math Content")').first()).toBeVisible();
    await expect(page.locator('h2:has-text("Background Remover")').first()).toBeVisible();
    await expect(page.locator('text=NEURAL TEAM NODES').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-dashboard-desktop-1440px.png'),
      fullPage: false,
    });

    // 2. Mobile 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-dashboard-mobile-375px.png'),
      fullPage: true,
    });
  });

  test('Page 2: PLP Math Content (/plp-math-content) - 1440px and 375px', async ({ page, baseURL }) => {
    const targetBase = getBaseUrl(baseURL);
    // 1. Desktop 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${targetBase}/plp-math-content`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Verify Untouched Sidebar Elements
    await expect(page.locator('text=PLP Math Content').first()).toBeVisible();
    await expect(page.locator('text=DYT ECOSYSTEM').first()).toBeVisible();

    // Verify Global Mechanical Cyber Background
    await expect(page.locator('[data-testid="cyber-bg-canvas"]')).toBeVisible();

    // Verify 2-Column Responsive Layout Elements
    await expect(page.locator('h1:has-text("PLP Math Content")').first()).toBeVisible();
    await expect(page.locator('text=Input Source').first()).toBeVisible();
    await expect(page.locator('text=MATHEMATICAL RECOGNITION STANDBY').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-plp-math-desktop-1440px.png'),
      fullPage: false,
    });

    // 2. Mobile 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-plp-math-mobile-375px.png'),
      fullPage: true,
    });
  });

  test('Page 3: Background Remover (/bg-remover) - 1440px, 375px, 3-Step Process & Mask Verification', async ({
    page,
    baseURL,
  }) => {
    const targetBase = getBaseUrl(baseURL);
    test.setTimeout(240000);
    page.on('console', (msg) => {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      console.log(`[PAGE ERROR] ${err.message}`);
    });

    // 1. Desktop 1440px Standby Chamber
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${targetBase}/bg-remover`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1000);

    // Verify Untouched Sidebar Elements
    await expect(page.locator('text=PLP Math Content').first()).toBeVisible();
    await expect(page.locator('text=DYT ECOSYSTEM').first()).toBeVisible();
    await expect(page.locator('aside a[href="/bg-remover"]').first()).toBeVisible();

    // Verify Global Mechanical Cyber Background
    await expect(page.locator('[data-testid="cyber-bg-canvas"]')).toBeVisible();

    // Verify 3-Step Process Elements & Prominent Primary Modes
    await expect(page.locator('[data-testid="content-mode-preserve-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="content-mode-person-text-only"]')).toBeVisible();
    await expect(page.locator('[data-testid="fast-preview-start-btn"]')).toBeVisible();

    // Verify Inspection Chamber Standby with Checkerboard Hint
    await expect(page.locator('text=PRECISION INSPECTION CHAMBER // STANDBY').first()).toBeVisible();
    await expect(page.locator('text=CANVAS: ALPHA MATRIX READY').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-bg-remover-desktop-1440px-standby.png'),
      fullPage: false,
    });

    // 2. Mobile 375px Standby
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-bg-remover-mobile-375px-standby.png'),
      fullPage: true,
    });

    // Reset to Desktop for fixture upload & segmentation
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    // 3. Upload Khmer Poster Fixture
    const fixturePath = path.join(FIXTURES_DIR, 'khmer-poster-eval.png');
    const fileInput = page.locator('[data-testid="image-upload-input"]');
    await fileInput.setInputFiles(fixturePath);

    const removeBtn = page.locator('button:has-text("ដកចេញ (REMOVE)")');
    await expect(removeBtn).toBeVisible({ timeout: 15000 });

    // 4. Select Person + Text Only mode
    const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"]');
    await personTextBtn.click();
    await expect(page.locator('[data-testid="sub-option-person"]')).toBeVisible();
    await expect(page.locator('[data-testid="sub-option-text"]')).toBeVisible();
    await expect(page.locator('[data-testid="sub-option-keep-graphics"]')).toBeVisible();

    // 5. Run Fast Preview
    const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"]');
    await fastPreviewBtn.click();

    // Capture scanning state
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-bg-remover-scanning-active.png'),
      fullPage: false,
    });

    // Wait for completed result (up to 120s for inference)
    const statusBadge = page.locator('[data-testid="mask-status-badge"]');
    const retryBtn = page.locator('button:has-text("ព្យាយាមម្តងទៀត (RETRY)")');
    try {
      await expect(statusBadge).toBeVisible({ timeout: 90000 });
    } catch {
      if (await retryBtn.isVisible()) {
        await retryBtn.click();
        await expect(statusBadge).toBeVisible({ timeout: 90000 });
      } else {
        throw new Error('Mask status badge not visible and retry button not found');
      }
    }

    // 6. Cutout Preview
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-bg-remover-cutout-preview.png'),
      fullPage: false,
    });

    // 7. Person Mask Tab
    const personMaskTab = page.locator('[data-testid="preview-tab-person-mask"]');
    await personMaskTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06-bg-remover-person-mask.png'),
      fullPage: false,
    });

    // 8. Text Mask Tab
    const textMaskTab = page.locator('[data-testid="preview-tab-text-mask"]');
    await textMaskTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07-bg-remover-text-mask.png'),
      fullPage: false,
    });

    // 9. Combined Keep Mask Tab
    const combinedMaskTab = page.locator('[data-testid="preview-tab-combined-mask"]');
    await combinedMaskTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08-bg-remover-combined-mask.png'),
      fullPage: false,
    });

    // 10. Transparent PNG Export Check
    const exportBtn = page.locator('[data-testid="export-transparent-png-btn"]');
    await expect(exportBtn).toBeVisible({ timeout: 15000 });

    // Mobile completed view
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-bg-remover-mobile-375px-completed.png'),
      fullPage: true,
    });
  });
});
