import { test, expect } from "@playwright/test";
import { resolveE2ECredentials } from "./test-credentials-resolver.js";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

test.describe("Real Authentication E2E Flow — Dedicated Non-Production Account", () => {
  const creds = resolveE2ECredentials();
  const e2eUsername = creds.superadmin.username;
  const e2ePassword = creds.superadmin.password;

  test("Real UI login flow via credentials without cookie mocking", async ({ page, baseURL }) => {
    const targetUrl = (baseURL || BASE_URL).replace(/\/+$/, "");

    // 1. Navigate to login form
    await page.goto(`${targetUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });

    // 2. Fill login credentials using real form fields
    const identifierInput = page.locator('input[data-testid="login-username-input"], input[name="usernameOrEmail"], input#login-name, input[type="text"]').first();
    const passwordInput = page.locator('input[data-testid="login-password-input"], input[name="password"], input#login-password, input[type="password"]').first();
    const submitBtn = page.locator('button[data-testid="login-submit-btn"], button[type="submit"]').first();

    await expect(identifierInput).toBeVisible({ timeout: 15000 });
    await expect(passwordInput).toBeVisible({ timeout: 15000 });

    await identifierInput.fill(e2eUsername);
    await passwordInput.fill(e2ePassword);
    await submitBtn.click();

    // 3. Wait for post-login navigation away from /login
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25000 });

    // 4. Verify access to Super Admin dashboard
    await page.goto(`${targetUrl}/admin/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("text=System Overview").first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator("text=Total Registered Users").first()).toBeVisible({ timeout: 20000 });
  });
});
