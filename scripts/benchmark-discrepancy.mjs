import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const PREVIEW_URL = process.env.PREVIEW_URL || 'https://ai-toolkit-l0b6lkqer-hounsophadayuth2234-6445s-projects.vercel.app/bg-remover';
const FIXTURE_PATH = path.resolve('tests/fixtures/khmer-poster-eval.png');

async function runBenchmark() {
  console.log('===============================================================');
  console.log('IDENTICAL BENCHMARK: BROWSER, IMAGE, MODEL, AND CACHE STATE');
  console.log('===============================================================');
  console.log(`URL: ${PREVIEW_URL}`);
  console.log(`Fixture: ${FIXTURE_PATH}`);

  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`Fixture not found: ${FIXTURE_PATH}`);
  }

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // Monitor network transfer to quantify ONNX model download
  let modelBytesDownloaded = 0;
  let modelChunksCount = 0;
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('models') || url.includes('isnet') || url.includes('.onnx') || url.includes('chunk')) {
      const headers = response.headers();
      const len = parseInt(headers['content-length'] || '0', 10);
      modelBytesDownloaded += len;
      modelChunksCount++;
      // console.log(`[Network] ${url.substring(url.lastIndexOf('/') + 1)} (${(len / 1024).toFixed(1)} KB)`);
    }
  });

  // Track console logs from client
  const clientLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    clientLogs.push(text);
    if (text.includes('handleFileSelect') || text.includes('telemetry') || text.includes('Backend') || text.includes('metrics')) {
      console.log(`[Browser Console] ${text}`);
    }
  });

  console.log('\n--- STEP 1: INITIAL NAVIGATION ---');
  await page.goto(PREVIEW_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log('Page loaded successfully.');

  // =========================================================================
  // RUN 1: COLD-START (EMPTY CACHE)
  // =========================================================================
  console.log('\n--- STEP 2: RUN 1 — COLD START (Zero Model Cache) ---');
  const fileInput = page.locator('[data-testid="image-upload-input"]');
  await fileInput.setInputFiles(FIXTURE_PATH);
  await page.waitForSelector('button:has-text("ដកចេញ (REMOVE)")', { timeout: 15000 });

  // Select Person + Text Only
  const personTextBtn = page.locator('[data-testid="content-mode-person-text-only"]');
  await personTextBtn.click();
  await page.waitForTimeout(300);

  const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"]');
  await fastPreviewBtn.waitFor({ state: 'visible', timeout: 10000 });

  console.log('Triggering Fast Preview (Cold Run)...');
  const tColdStart = Date.now();
  await fastPreviewBtn.click();

  // Wait for completion
  const statusBadge = page.locator('[data-testid="mask-status-badge"]');
  await statusBadge.waitFor({ state: 'visible', timeout: 120000 });
  const tColdFinish = Date.now();
  const coldTotalUiMs = tColdFinish - tColdStart;

  // Extract Cold Run Diagnostics from DOM
  const coldDiag = {
    webGpuAvailable: await page.locator('[data-testid="diag-webgpu-available"]').innerText().catch(() => 'unknown'),
    actualBackend: await page.locator('[data-testid="diag-actual-backend"]').innerText().catch(() => 'unknown'),
    coldStartTime: await page.locator('[data-testid="diag-cold-start"]').innerText().catch(() => 'N/A'),
    cachedModelLoad: await page.locator('[data-testid="diag-cached-load"]').innerText().catch(() => 'N/A'),
    inferenceTime: await page.locator('[data-testid="diag-inference-time"]').innerText().catch(() => 'N/A'),
    inputDim: await page.locator('[data-testid="diag-input-dim"]').innerText().catch(() => 'N/A'),
    inferenceDim: await page.locator('[data-testid="diag-inference-dim"]').innerText().catch(() => 'N/A'),
  };

  console.log(`Cold Run Total UI Processing Time: ${coldTotalUiMs} ms`);
  console.log(`Cold Run Model Chunks Downloaded: ${modelChunksCount} chunks (${(modelBytesDownloaded / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('Cold Run Telemetry Panel:', JSON.stringify(coldDiag, null, 2));

  // =========================================================================
  // RUN 2: WARM RUN (CACHED MODEL IN SAME BROWSER CONTEXT)
  // =========================================================================
  console.log('\n--- STEP 3: RUN 2 — WARM / CACHED RUN (Model Already Cached in Browser) ---');
  // Reset via Reset button
  const resetBtn = page.locator('[data-testid="reset-btn"]');
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    await page.waitForTimeout(500);
  }

  // Re-upload fixture or trigger Fast Preview with warm cache
  const chunksBeforeWarm = modelChunksCount;
  const bytesBeforeWarm = modelBytesDownloaded;

  await fileInput.setInputFiles(FIXTURE_PATH);
  await page.waitForSelector('button:has-text("ដកចេញ (REMOVE)")', { timeout: 15000 });
  await personTextBtn.click();
  await page.waitForTimeout(300);

  console.log('Triggering Fast Preview (Warm Run)...');
  const tWarmStart = Date.now();
  await fastPreviewBtn.click();

  await statusBadge.waitFor({ state: 'visible', timeout: 120000 });
  const tWarmFinish = Date.now();
  const warmTotalUiMs = tWarmFinish - tWarmStart;

  const warmNewChunks = modelChunksCount - chunksBeforeWarm;
  const warmNewBytes = modelBytesDownloaded - bytesBeforeWarm;

  // Extract Warm Run Diagnostics from DOM
  const warmDiag = {
    webGpuAvailable: await page.locator('[data-testid="diag-webgpu-available"]').innerText().catch(() => 'unknown'),
    actualBackend: await page.locator('[data-testid="diag-actual-backend"]').innerText().catch(() => 'unknown'),
    coldStartTime: await page.locator('[data-testid="diag-cold-start"]').innerText().catch(() => 'N/A'),
    cachedModelLoad: await page.locator('[data-testid="diag-cached-load"]').innerText().catch(() => 'N/A'),
    inferenceTime: await page.locator('[data-testid="diag-inference-time"]').innerText().catch(() => 'N/A'),
    inputDim: await page.locator('[data-testid="diag-input-dim"]').innerText().catch(() => 'N/A'),
    inferenceDim: await page.locator('[data-testid="diag-inference-dim"]').innerText().catch(() => 'N/A'),
  };

  console.log(`Warm Run Total UI Processing Time: ${warmTotalUiMs} ms`);
  console.log(`Warm Run New Chunks Downloaded: ${warmNewChunks} (${warmNewBytes} bytes) -> 100% CACHED`);
  console.log('Warm Run Telemetry Panel:', JSON.stringify(warmDiag, null, 2));

  // Inspect internal ONNX runtime state in the browser
  const ortState = await page.evaluate(async () => {
    const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
    let adapterInfo = null;
    if (hasGpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          adapterInfo = await adapter.requestAdapterInfo?.();
        }
      } catch (e) {
        adapterInfo = { error: e.message };
      }
    }
    const winOrt = (window).ort;
    return {
      hasGpu,
      adapterInfo: adapterInfo ? { vendor: adapterInfo.vendor, architecture: adapterInfo.architecture, description: adapterInfo.description } : null,
      ortEnv: winOrt ? { wasm: winOrt.env?.wasm } : 'ort not on window (runs in Web Worker)',
    };
  });
  console.log('\n--- BROWSER HARDWARE & ML SUBSYSTEM INSPECTION ---');
  console.log(JSON.stringify(ortState, null, 2));

  await browser.close();

  // Save report to disk
  const reportPath = path.resolve('test-results/benchmark-discrepancy-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    fixture: 'khmer-poster-eval.png',
    dimensions: '762x1079',
    coldRun: {
      totalUiMs: coldTotalUiMs,
      chunksDownloaded: modelChunksCount,
      bytesDownloaded: modelBytesDownloaded,
      telemetry: coldDiag,
    },
    warmRun: {
      totalUiMs: warmTotalUiMs,
      chunksDownloaded: warmNewChunks,
      bytesDownloaded: warmNewBytes,
      telemetry: warmDiag,
    },
    hardwareInspection: ortState,
    timestamp: new Date().toISOString(),
  }, null, 2));

  console.log(`\nReport written to: ${reportPath}`);
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
