import { test, expect } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL || "https://math.dytcore.com").replace(/\/+$/, "");

test.describe("Real Authentication E2E Flow — Dedicated Non-Production Account", () => {
  const e2eUsername = process.env.E2E_SUPERADMIN_USERNAME || process.env.TEST_SUPERADMIN_USERNAME;
  const e2ePassword = process.env.E2E_SUPERADMIN_PASSWORD || process.env.TEST_SUPERADMIN_PASSWORD;

  test("Real UI login flow via credentials without cookie mocking", async ({ page, baseURL }) => {
    // Requires non-production test account configured securely via environment variables
    if (!e2eUsername || !e2ePassword) {
      test.skip(
        true,
        "Dedicated non-production test credentials (E2E_SUPERADMIN_USERNAME / E2E_SUPERADMIN_PASSWORD) not configured in runner environment."
      );
      return;
    }

    const targetUrl = (baseURL || BASE_URL).replace(/\/+$/, "");

    // 1. Navigate to login form
    await page.goto(`${targetUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2. Fill login credentials (never printed or logged)
    const identifierInput = page.locator('input[data-testid="login-username-input"], input[name="usernameOrEmail"], input#login-name, input[type="text"]').first();
    const passwordInput = page.locator('input[data-testid="login-password-input"], input[name="password"], input#login-password, input[type="password"]').first();
    const submitBtn = page.locator('button[data-testid="login-submit-btn"], button[type="submit"]').first();

    await expect(identifierInput).toBeVisible({ timeout: 15000 });
    await expect(passwordInput).toBeVisible({ timeout: 15000 });

    await identifierInput.fill(e2eUsername);
    await passwordInput.fill(e2ePassword);
    await submitBtn.click();

    // 3. Wait for post-login navigation
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });

    // 4. Verify access to Super Admin dashboard
    await page.goto(`${targetUrl}/admin/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("text=System Overview").first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator("text=Total Registered Users").first()).toBeVisible({ timeout: 20000 });
  });
});
