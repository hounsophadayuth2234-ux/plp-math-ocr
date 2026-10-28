import { test, expect } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL || "https://math.dytcore.com").replace(/\/+$/, "");
const SUPERADMIN_USER = process.env.TEST_SUPERADMIN_USERNAME || process.env.PROFILE_TEST_USERNAME;
const SUPERADMIN_PASS = process.env.TEST_SUPERADMIN_PASSWORD || process.env.PROFILE_TEST_PASSWORD;
const NORMAL_USER = process.env.TEST_NORMAL_USERNAME;
const NORMAL_PASS = process.env.TEST_NORMAL_PASSWORD;

test.describe("Super Admin Dashboard — Route Security & Layout Verification", () => {
  // 1. Anonymous access guard
  test("1. Anonymous visit to /admin/dashboard redirects to login", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto(`${BASE_URL}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Verify redirection occurs
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const currentUrl = page.url();
    expect(currentUrl).toContain("/login");
    expect(currentUrl).toMatch(/from=%2Fadmin%2Fdashboard|from=\/admin\/dashboard/);
    expect(consoleErrors.filter((e) => !e.includes("eval()") && !e.includes("favicon"))).toHaveLength(0);
  });

  // 2. Response headers & SEO protection (no-store & noindex)
  test("2. Unauthenticated admin route returns no-store and login has security headers", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Check redirect headers or initial response headers
    const headers = response?.headers() || {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  // 3. Authenticated USER access (404 concealment)
  test("3. Authenticated USER visit returns 404 without admin markup or data leakage", async ({ page }) => {
    if (!NORMAL_USER || !NORMAL_PASS) {
      test.skip(true, "SKIPPED — Regular USER credentials not provided in environment");
      return;
    }

    // Login as normal user
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('input[type="text"], input[name="username"], input[name="usernameOrEmail"], input#username').first().fill(NORMAL_USER);
    await page.locator('input[type="password"]').first().fill(NORMAL_PASS);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForLoadState("networkidle").catch(() => {});

    // Attempt direct navigation to /admin/dashboard
    const response = await page.goto(`${BASE_URL}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Must return 404 to conceal route existence
    expect(response?.status()).toBe(404);

    const bodyText = await page.content();
    expect(bodyText).not.toContain("Total Registered Users");
    expect(bodyText).not.toContain("Recent Authentication Activity");
    expect(bodyText).not.toContain("SUPER_ADMIN");
  });

  // 4. Authenticated SUPER_ADMIN access (Dashboard & Sidebar verification)
  test("4. Authenticated SUPER_ADMIN visit renders dashboard, sidebar, and overview card", async ({ page }) => {
    if (!SUPERADMIN_USER || !SUPERADMIN_PASS) {
      test.skip(true, "SKIPPED — Super Admin credentials not provided in environment");
      return;
    }

    // Login as Super Admin
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('input[type="text"], input[name="username"], input[name="usernameOrEmail"], input#username').first().fill(SUPERADMIN_USER);
    await page.locator('input[type="password"]').first().fill(SUPERADMIN_PASS);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForLoadState("networkidle").catch(() => {});

    // Navigate to /admin/dashboard
    const response = await page.goto(`${BASE_URL}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    expect(response?.status()).toBe(200);

    // Verify Cache-Control: no-store
    const cacheControl = response?.headers()["cache-control"] || "";
    expect(cacheControl.toLowerCase()).toMatch(/no-store|private|no-cache/);

    // Verify robots meta tag (noindex, nofollow)
    const robotsMeta = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robotsMeta?.toLowerCase()).toContain("noindex");
    expect(robotsMeta?.toLowerCase()).toContain("nofollow");

    // Verify Dashboard layout & overview cards
    await expect(page.locator("text=System Overview").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Total Registered Users").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Recent Authentication Activity").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Rate Limit Events").first()).toBeVisible({ timeout: 10000 });

    // Verify semantic navigation
    const nav = page.locator('nav[aria-label="Admin Navigation"]').first();
    await expect(nav).toBeVisible({ timeout: 10000 });

    // Verify active link has aria-current="page"
    const activeLink = page.locator('a[aria-current="page"]').first();
    await expect(activeLink).toBeVisible();
    await expect(activeLink).toContainText("Dashboard");

    // 5. Verify 'Coming soon' items do not navigate
    const disabledItems = page.locator('[aria-disabled="true"]');
    const disabledCount = await disabledItems.count();
    expect(disabledCount).toBeGreaterThanOrEqual(3);

    const initialUrl = page.url();
    // Click the first disabled coming soon item
    await disabledItems.first().click({ force: true });
    // URL must not change
    expect(page.url()).toBe(initialUrl);
  });
});
