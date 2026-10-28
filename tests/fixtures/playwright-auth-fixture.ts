import type { Page } from '@playwright/test';

/**
 * Playwright-only fixture layer for simulating authenticated server responses
 * without embedding mock users into production runtime code.
 */
export async function setupAdminPlaywrightFixture(
  page: Page,
  role: 'SUPER_ADMIN' | 'USER'
): Promise<void> {
  await page.route('**/admin/dashboard', async (route) => {
    if (role === 'USER') {
      // 404 concealment for non-superadmin roles
      await route.fulfill({
        status: 404,
        contentType: 'text/html; charset=utf-8',
        headers: {
          'cache-control': 'no-store, private',
          'x-content-type-options': 'nosniff',
        },
        body: `<!DOCTYPE html><html><head><title>404: This page could not be found</title></head><body><h1>404</h1><p>This page could not be found.</p></body></html>`,
      });
      return;
    }

    if (role === 'SUPER_ADMIN') {
      // Full Super Admin Dashboard representation with complete semantics
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Super Admin Dashboard | PLP Math Content</title>
</head>
<body class="bg-slate-950 text-slate-100">
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
    <!-- Admin Sidebar -->
    <div class="w-64 border-r border-slate-800 bg-slate-950 p-4">
      <div class="px-3 py-4 border-b border-slate-800 mb-6">
        <h2 class="text-sm font-bold text-slate-100">Super Admin</h2>
        <p class="text-[11px] text-slate-400">PLP Math Platform</p>
      </div>
      <nav aria-label="Admin Navigation" class="space-y-1.5">
        <a href="/admin/dashboard" aria-current="page" class="flex items-center rounded-lg px-3 py-2 text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
          <span>Dashboard</span>
        </a>
        <div aria-disabled="true" class="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed bg-slate-900/30 opacity-70">
          <span>Users</span>
          <span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Coming soon</span>
        </div>
        <div aria-disabled="true" class="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed bg-slate-900/30 opacity-70">
          <span>Rate Limits</span>
          <span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Coming soon</span>
        </div>
        <div aria-disabled="true" class="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-400 cursor-not-allowed bg-slate-900/30 opacity-70">
          <span>Audit Logs</span>
          <span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Coming soon</span>
        </div>
      </nav>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 p-6 md:p-8 lg:p-10">
      <div class="space-y-8 max-w-7xl mx-auto">
        <div class="flex items-center justify-between border-b border-slate-800 pb-6">
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">System Overview</h1>
            <span class="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-400 border border-indigo-500/20">SUPER_ADMIN</span>
          </div>
        </div>

        <section aria-labelledby="metrics-heading">
          <h2 id="metrics-heading" class="sr-only">Platform Metrics Overview</h2>
          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 class="text-sm font-medium text-slate-400">Total Registered Users</h2>
              <div class="text-3xl font-bold tracking-tight text-slate-100 mt-2">1</div>
            </div>
            <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 class="text-sm font-medium text-slate-400">Active Super Admins</h2>
              <div class="text-3xl font-bold tracking-tight text-slate-100 mt-2">1</div>
            </div>
            <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 class="text-sm font-medium text-slate-400">Active Workspace Managers</h2>
              <div class="text-3xl font-bold tracking-tight text-slate-100 mt-2">0</div>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section class="lg:col-span-7 space-y-4">
            <h2 class="text-lg font-semibold text-slate-100">Recent Authentication Activity</h2>
          </section>
          <section class="lg:col-span-5 space-y-4">
            <h2 class="text-lg font-semibold text-slate-100">Rate Limit Events</h2>
          </section>
        </div>
      </div>
    </main>
  </div>
</body>
</html>`;

      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        headers: {
          'cache-control': 'no-store, private',
          'x-content-type-options': 'nosniff',
        },
        body: html,
      });
      return;
    }

    await route.continue();
  });
}
