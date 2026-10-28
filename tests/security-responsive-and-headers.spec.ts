import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.BASE_URL || 'https://math.dytcore.com').replace(/\/+$/, '');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

test.describe('Security Hardening & Responsive Viewport Verification', () => {
  for (const vp of VIEWPORTS) {
    test(`Responsive check on ${vp.name} (${vp.width}x${vp.height}): login page without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const response = await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      expect(response?.status()).toBe(200);

      // Check for horizontal overflow
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Confirm login form is visible
      const form = page.locator('form').first();
      await expect(form).toBeVisible();
    });

    test(`Responsive check on ${vp.name} (${vp.width}x${vp.height}): public routes render cleanly`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check logo visibility
      const logo = page.locator('img[src*="plp-math-content-logo"]').first();
      await expect(logo).toBeVisible({ timeout: 10000 });
    });
  }

  test('Security response headers validation', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response?.status()).toBe(200);

    const headers = response?.headers() || {};
    // Verify core security headers
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBeDefined();
    expect(headers['x-frame-options']).toBeDefined();
  });

  test('Secret scanning against page HTML and client resources', async ({ page }) => {
    const interceptedBodies: string[] = [];
    page.on('response', async (res) => {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('text/html') || ct.includes('javascript') || ct.includes('json')) {
          const body = await res.text();
          interceptedBodies.push(body);
        }
      } catch {
        // Ignored for streaming/redirects
      }
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });

    const forbiddenPatterns = [
      /https:\/\/[a-zA-Z0-9.-]+\.upstash\.io/i, // Real Upstash Redis hostnames/URLs
      /AX[a-zA-Z0-9_-]{20,}/i, // Upstash bearer token pattern
      /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // Real JWT token pattern
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // PEM private keys
      /AIzaSy[0-9A-Za-z_-]{33}/, // Google API keys
      /sk-[a-zA-Z0-9]{20,}/, // OpenAI/service keys
      /postgres:\/\/[^:]+:[^@]+@/, // Database credentials
    ];

    for (const body of interceptedBodies) {
      for (const pattern of forbiddenPatterns) {
        expect(body).not.toMatch(pattern);
      }
    }
  });
});
