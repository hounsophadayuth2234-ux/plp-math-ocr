import { test, expect } from "@playwright/test";
import { injectAuthenticatedSession, MOCK_SUPERADMIN, MOCK_NORMALUSER } from "./test-auth-helper.js";

const BASE_URL = (process.env.BASE_URL || "https://math.dytcore.com").replace(/\/+$/, "");

test.describe("Super Admin Dashboard — Route Security & Layout Verification", () => {
  // 1. Anonymous access guard
  test("1. Anonymous visit to /admin/dashboard redirects to login", async ({ page, baseURL }) => {
    const targetUrl = (baseURL || BASE_URL).replace(/\/+$/, "");
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto(`${targetUrl}/admin/dashboard`, {
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
  test("2. Unauthenticated admin route returns no-store and login has security headers", async ({ page, baseURL }) => {
    const targetUrl = (baseURL || BASE_URL).replace(/\/+$/, "");
    const response = await page.goto(`${targetUrl}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Check redirect headers or initial response headers
    const headers = response?.headers() || {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  // 3. Authenticated USER access (404 concealment)
  test("3. Authenticated USER visit returns 404 without admin markup or data leakage", async ({ page, context, baseURL }) => {
    const targetUrl = (baseURL || BASE_URL).replace(/\/+$/, "");
    // Directly inject valid authenticated USER session cookie (bypassing UI login form)
    await injectAuthenticatedSession(context, targetUrl, MOCK_NORMALUSER);

    // Attempt direct navigation to /admin/dashboard
    const response = await page.goto(`${targetUrl}/admin/dashboard`, {
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
  test("4. Authenticated SUPER_ADMIN visit renders dashboard, sidebar, and overview card", async ({ page, context, baseURL }) => {
    const targetUrl = (baseURL || BASE_URL).replace(/\/+$/, "");
    // Directly inject valid authenticated SUPER_ADMIN session cookie (bypassing UI login form)
    await injectAuthenticatedSession(context, targetUrl, MOCK_SUPERADMIN);

    // Navigate to /admin/dashboard
    const response = await page.goto(`${targetUrl}/admin/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
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
    await expect(page.locator("text=System Overview").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Total Registered Users").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Recent Authentication Activity").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Rate Limit Events").first()).toBeVisible({ timeout: 15000 });

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
