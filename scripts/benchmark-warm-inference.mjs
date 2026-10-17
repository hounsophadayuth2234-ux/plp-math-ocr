import { chromium } from 'playwright';
import path from 'node:path';

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://ai-toolkit-l0b6lkqer-hounsophadayuth2234-6445s-projects.vercel.app/bg-remover';

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();

  console.log('Navigating to Preview URL:', PREVIEW_URL);
  await page.goto(PREVIEW_URL, { waitUntil: 'load', timeout: 60000 });

  const fileInput = page.locator('[data-testid="image-upload-input"]');
  const removeBtn = page.locator('button[aria-label*="ដករូបភាពនេះចេញ"]');
  const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"]');
  const startBtn = page.locator('[data-testid="fast-preview-start-btn"]');
  const statusBadge = page.locator('[data-testid="mask-status-badge"]');

  // 1. Run 1: Cold start with khmer-poster-eval.png (downloads model chunks)
  console.log('\n--- 1. RUN 1: Cold start (Fetching model from network) ---');
  await fileInput.setInputFiles(path.resolve('tests/fixtures/khmer-poster-eval.png'));
  await page.waitForSelector('button[aria-label*="ដករូបភាពនេះចេញ"]', { timeout: 15000 });
  await personTextBtn.click();
  
  const tColdStart = Date.now();
  await startBtn.click();
  await statusBadge.waitFor({ state: 'visible', timeout: 120000 });
  const coldDuration = Date.now() - tColdStart;
  console.log(`Cold start total UI duration (Fetch + Init + Inference): ${coldDuration} ms`);

  // 2. Clear image
  await removeBtn.click();
  await page.waitForTimeout(500);

  // 3. Run 2: Warm start with a DIFFERENT fresh image: long-dark-hair.png
  // Model weights are already cached in browser IndexedDB/RAM. Zero model download!
  console.log('\n--- 2. RUN 2: Warm start with DIFFERENT image (Zero model download, pure compute) ---');
  await fileInput.setInputFiles(path.resolve('tests/fixtures/long-dark-hair.png'));
  await page.waitForSelector('button[aria-label*="ដករូបភាពនេះចេញ"]', { timeout: 15000 });
  await personTextBtn.click();

  const tWarmStart = Date.now();
  await startBtn.click();
  await statusBadge.waitFor({ state: 'visible', timeout: 120000 });
  const warmDuration = Date.now() - tWarmStart;
  console.log(`Warm run total UI duration (Pure Model Load from Cache + Inference): ${warmDuration} ms`);

  // 4. Run 3: Warm start with third image: white-clothing.png
  await removeBtn.click();
  await page.waitForTimeout(500);
  console.log('\n--- 3. RUN 3: Warm start with third image (white-clothing.png) ---');
  await fileInput.setInputFiles(path.resolve('tests/fixtures/white-clothing.png'));
  await page.waitForSelector('button[aria-label*="ដករូបភាពនេះចេញ"]', { timeout: 15000 });
  await personTextBtn.click();

  const tWarm3Start = Date.now();
  await startBtn.click();
  await statusBadge.waitFor({ state: 'visible', timeout: 120000 });
  const warm3Duration = Date.now() - tWarm3Start;
  console.log(`Third image warm UI duration: ${warm3Duration} ms`);

  // Read diagnostics
  const finalDiag = {
    actualBackend: await page.locator('[data-testid="diag-actual-backend"]').innerText().catch(() => 'unknown'),
    coldStartTime: await page.locator('[data-testid="diag-cold-start"]').innerText().catch(() => 'N/A'),
    cachedModelLoad: await page.locator('[data-testid="diag-cached-load"]').innerText().catch(() => 'N/A'),
    inferenceTime: await page.locator('[data-testid="diag-inference-time"]').innerText().catch(() => 'N/A'),
  };
  console.log('\nFinal UI Diagnostics Panel:', JSON.stringify(finalDiag, null, 2));

  await browser.close();
}

run().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});
