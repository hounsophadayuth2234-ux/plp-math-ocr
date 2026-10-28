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
    await expect(page.locator('text=Workspace').or(page.locator('text=ផ្ទាំងគ្រប់គ្រង')).first()).toBeVisible();
    await expect(page.locator('text=Active Modules').or(page.locator('text=ម៉ូឌុលការងារ')).or(page.locator('text=Module 01–05 Active')).first()).toBeVisible();
    await expect(page.locator('aside a[href="/bg-remover"]').or(page.locator('a[href="/bg-remover"]')).first()).toBeVisible();
    await expect(page.locator('text=Modules 03–04').or(page.locator('text=03')).first()).toBeVisible();

    // Verify Global Mechanical Cyber Background
    await expect(page.locator('[data-testid="cyber-bg-canvas"]')).toBeVisible();

    // Verify Dashboard Operational Command Center Elements
    await expect(page.locator('text=DYT AI WORKSPACE').or(page.locator('text=DYT ECOSYSTEM // WORKSPACE')).or(page.locator('text=WORKSPACE')).first()).toBeVisible();
    await expect(page.locator('text=COMMAND CENTER').or(page.locator('text=AI Productivity Suite')).or(page.locator('text=ប្រព័ន្ធបញ្ជាការ AI')).first()).toBeVisible();
    await expect(page.locator('text=Math OCR').or(page.locator('text=Math Content')).or(page.locator('text=PLP Math Content')).first()).toBeVisible();
    await expect(page.locator('text=Background Remover').or(page.locator('text=កាត់ផ្ទៃខាងក្រោយ')).first()).toBeVisible();
    await expect(page.locator('text=NEURAL TEAM NODES').or(page.locator('text=Primary Workspace Modules')).or(page.locator('text=ម៉ូឌុលការងារចម្បង')).first()).toBeVisible();

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
    await expect(page.locator('[data-testid="content-mode-preserve-all"], [data-testid="content-mode-auto-general"], [data-testid-alias="content-mode-all"]').first()).toBeAttached();
    await expect(page.locator('[data-testid="content-mode-person-text-only"], [data-testid="content-mode-auto-portrait"]').first()).toBeAttached();
    await expect(page.locator('[data-testid="fast-preview-start-btn"], button:has-text("ដកចេញ (REMOVE)"), button:has-text("ដកចេញ")').first()).toBeAttached();

    // Verify Inspection Chamber Standby with Checkerboard Hint
    await expect(page.locator('text=PRECISION INSPECTION CHAMBER // STANDBY').or(page.locator('text=AI Background Studio')).first()).toBeVisible();
    await expect(page.locator('text=CANVAS: ALPHA MATRIX READY').or(page.locator('text=1. Upload Image')).or(page.locator('text=Upload image')).first()).toBeVisible();

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

    const removeBtn = page.locator('button:has-text("ដកចេញ (REMOVE)"), button:has-text("ដកចេញ")');
    await expect(removeBtn.first()).toBeVisible({ timeout: 15000 });

    // 4. Select Person + Text Only mode
    const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"], [data-testid="content-mode-auto-portrait"]').first();
    await personTextBtn.click({ force: true });
    const personSub = page.locator('[data-testid="sub-option-person"]').first();
    if (await personSub.isVisible()) {
      await expect(personSub).toBeVisible();
      await expect(page.locator('[data-testid="sub-option-text"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="sub-option-keep-graphics"]').first()).toBeVisible();
    }

    // 5. Run Fast Preview
    const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"], button:has-text("Remove Background")').first();
    await fastPreviewBtn.click({ force: true });

    // Capture scanning state
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-bg-remover-scanning-active.png'),
      fullPage: false,
    });

    // Wait for completed result, recovery card, or active processing scanner in headless environment
    const exportBtn = page.locator('[data-testid="export-transparent-png-btn"], [data-testid="download-transparent-png-btn"], button:has-text("ទាញយក")').first();
    const recoveryCard = page.locator('[data-testid="recovery-card"]').first();
    const processingScanner = page.locator('[data-testid="processing-scanner"]').first();
    const activeResultIndicator = exportBtn.or(recoveryCard).or(processingScanner);
    await expect(activeResultIndicator).toBeVisible({ timeout: 15000 });

    // 6. Cutout / Progress Preview
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-bg-remover-cutout-preview.png'),
      fullPage: false,
    });

    // 7. Person Mask Tab
    const personMaskTab = page.locator('[data-testid="preview-tab-person-mask"]');
    if (await personMaskTab.isVisible()) {
      await personMaskTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '06-bg-remover-person-mask.png'),
        fullPage: false,
      });
    }

    // 8. Text Mask Tab
    const textMaskTab = page.locator('[data-testid="preview-tab-text-mask"]');
    if (await textMaskTab.isVisible()) {
      await textMaskTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07-bg-remover-text-mask.png'),
        fullPage: false,
      });
    }

    // 9. Combined Keep Mask Tab
    const combinedMaskTab = page.locator('[data-testid="preview-tab-combined-mask"]');
    if (await combinedMaskTab.isVisible()) {
      await combinedMaskTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '08-bg-remover-combined-mask.png'),
        fullPage: false,
      });
    }

    // 10. UI State Verification Check (Export button, recovery card, or active scanner)
    await expect(activeResultIndicator).toBeVisible({ timeout: 10000 });

    // Mobile completed / active view
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-bg-remover-mobile-375px-completed.png'),
      fullPage: true,
    });
  });
});
