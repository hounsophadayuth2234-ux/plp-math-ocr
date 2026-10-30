import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.(js|ts)/,
  workers: 1,
  timeout: 300000,
  expect: {
    timeout: 30000,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'playwright-results.json' }],
  ],
  use: {
    baseURL: (process.env.BASE_URL || 'http://localhost:3005').replace(/\/+$/, ''),
    channel: 'chrome',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
});
