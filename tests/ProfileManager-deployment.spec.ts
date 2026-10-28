import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.BASE_URL || 'https://math.dytcore.com').replace(/\/+$/, '');
const TEST_USERNAME = process.env.PROFILE_TEST_USERNAME;
const TEST_PASSWORD = process.env.PROFILE_TEST_PASSWORD;

test.describe('ProfileManager Deployment & Route Security Verification', () => {
  test('1. Unauthenticated root "/" redirects to "/login"', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBeLessThan(400);

    // Verify redirected to login
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
    expect(consoleErrors.filter((e) => !e.includes('eval()') && !e.includes('favicon'))).toHaveLength(0);
  });

  test('2. Unauthenticated "/profile" redirects to "/login?from=%2Fprofile"', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBeLessThan(400);

    // Verify redirected to login with from query parameter preserved
    await page.waitForURL(/\/login.*from/, { timeout: 15000 });
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
    expect(currentUrl).toMatch(/from=%2Fprofile|from=\/profile/);
    expect(consoleErrors.filter((e) => !e.includes('eval()') && !e.includes('favicon'))).toHaveLength(0);
  });

  test('3. Login page renders without server errors and displays PLP Math Content logo (desktop & mobile)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Desktop viewport check (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    const response = await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBe(200);

    // Verify presence of login form controls
    const loginForm = page.locator('form');
    await expect(loginForm.first()).toBeVisible({ timeout: 10000 });

    const usernameInput = page.locator('input[type="text"], input[name="username"], input[name="usernameOrEmail"], input#username');
    await expect(usernameInput.first()).toBeVisible({ timeout: 10000 });

    // Verify PLP logo on desktop
    const logoImgDesktop = page.locator('img[alt*="PLP Math Content logo"], img[src*="plp-math-content-logo"]').first();
    await expect(logoImgDesktop).toBeVisible({ timeout: 10000 });

    const altText = await logoImgDesktop.getAttribute('alt');
    expect(altText && altText.trim().length > 0).toBeTruthy();

    // Verify image loads successfully (naturalWidth > 0)
    await expect(async () => {
      const isImageLoaded = await logoImgDesktop.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
      expect(isImageLoaded).toBe(true);
    }).toPass({ timeout: 10000 });

    // Mobile viewport check (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    const logoImgMobile = page.locator('img[alt*="PLP Math Content logo"], img[src*="plp-math-content-logo"]').first();
    await expect(logoImgMobile).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      const isMobileImageLoaded = await logoImgMobile.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
      expect(isMobileImageLoaded).toBe(true);
    }).toPass({ timeout: 10000 });

    expect(consoleErrors.filter((e) => !e.includes('eval()') && !e.includes('favicon'))).toHaveLength(0);
  });

  test('4. Authenticated ProfileManager verification (Avatar upload & Username editing)', async ({ page }) => {
    // If credentials are not provided via environment variables, skip and mark BLOCKED
    if (!TEST_USERNAME || !TEST_PASSWORD) {
      test.skip(true, 'BLOCKED — TEST CREDENTIALS NOT PROVIDED');
      return;
    }

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Perform login
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const usernameInput = page.locator('input[type="text"], input[name="username"], input[name="usernameOrEmail"], input#username').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await usernameInput.fill(TEST_USERNAME);
    await passwordInput.fill(TEST_PASSWORD);
    await submitBtn.click();

    // 2. Navigate to /profile if not redirected automatically
    await page.waitForLoadState('networkidle').catch(() => {});
    if (!page.url().includes('/profile')) {
      await page.goto(`${BASE_URL}/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // 3. Confirm Canonical ProfileManager content is mounted
    await page.waitForSelector('text=Personal Information, text=ព័ត៌មានផ្ទាល់ខ្លួន, text=Profile, text=Username', { timeout: 15000 });

    // 4. Confirm Avatar upload control is present
    const avatarUploadInput = page.locator('input[type="file"][accept*="image"]');
    await expect(avatarUploadInput).toBeAttached({ timeout: 10000 });

    // 5. Confirm Username editing control is present
    const usernameField = page.locator('text=Username, text=ឈ្មោះគណនី');
    await expect(usernameField.first()).toBeVisible({ timeout: 10000 });

    expect(consoleErrors.filter((e) => !e.includes('eval()') && !e.includes('favicon'))).toHaveLength(0);
  });
});
