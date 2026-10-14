import puppeteer from 'puppeteer-core';
import path from 'path';

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TIMEOUT_MS = 120000;

async function runBiRefNetBench() {
  console.log("=== STARTING BIREFNET BROWSER WORKER BENCHMARK ===");
  console.log(`Strict Timeout: ${TIMEOUT_MS / 1000}s`);

  let currentStage = "BROWSER_LAUNCH";
  const startTime = Date.now();

  const timeoutTimer = setTimeout(() => {
    console.error(`\n[TIMEOUT EXPIRED] Test exceeded ${TIMEOUT_MS / 1000}s limit!`);
    console.error(`Exact Blocking Stage: ${currentStage}`);
    console.error(`Elapsed Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    process.exit(2);
  }, TIMEOUT_MS);

  try {
    currentStage = "LAUNCHING_CHROMIUM";
    const t0 = Date.now();
    const browser = await puppeteer.launch({
      executablePath: BROWSER_EXECUTABLE,
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-features=WebGPU"]
    });
    console.log(`✓ Chromium launched in ${Date.now() - t0} ms`);

    currentStage = "OPENING_PAGE";
    const page = await browser.newPage();
    page.on("console", (msg) => {
      console.log(`  [Browser ${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error(`  [Browser PageError] ${err.message}`);
    });

    await page.goto("about:blank");
    console.log(`✓ Base page ready in ${Date.now() - t0} ms`);

    currentStage = "INITIALIZING_WORKER";
    console.log("Starting Web Worker with Transformers.js CDN & BiRefNet...");

    const evalResult = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const workerScript = `
          self.postMessage({ stage: 'WORKER_SCRIPT_STARTED' });
          try {
            importScripts('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js');
            self.postMessage({ stage: 'TRANSFORMERS_LOADED', ok: typeof self.transformers !== 'undefined' });
          } catch (err) {
            self.postMessage({ stage: 'IMPORT_SCRIPTS_ERROR', error: err.message });
          }

          self.onmessage = async (e) => {
            if (e.data.type === 'START_INFERENCE') {
              try {
                if (!self.transformers) throw new Error("Transformers not loaded");
                self.postMessage({ stage: 'MODEL_DOWNLOAD_START' });
                
                const pipe = await self.transformers.pipeline('image-segmentation', 'onnx-community/BiRefNet_lite-ONNX', {
                  progress_callback: (p) => {
                    self.postMessage({ stage: 'DOWNLOAD_PROGRESS', file: p.file, progress: p.progress });
                  }
                });

                self.postMessage({ stage: 'MODEL_LOADED' });
              } catch (mErr) {
                self.postMessage({ stage: 'MODEL_ERROR', error: mErr.message });
              }
            }
          };
        `;

        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        worker.onmessage = (event) => {
          const data = event.data;
          console.log("[Worker Event]", JSON.stringify(data));
          if (data.stage === 'TRANSFORMERS_LOADED') {
            worker.postMessage({ type: 'START_INFERENCE' });
          } else if (data.stage === 'MODEL_LOADED') {
            resolve({ success: true });
            worker.terminate();
          } else if (data.stage === 'IMPORT_SCRIPTS_ERROR' || data.stage === 'MODEL_ERROR') {
            reject(new Error(data.error || data.stage));
            worker.terminate();
          }
        };

        worker.onerror = (wErr) => {
          console.error("[Worker Error]", wErr.message);
          reject(new Error(wErr.message));
        };
      });
    });

    console.log("Evaluation Result:", evalResult);
    currentStage = "COMPLETED";
    clearTimeout(timeoutTimer);
    await browser.close();
    console.log(`✓ Benchmark completed successfully in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (err) {
    clearTimeout(timeoutTimer);
    console.error(`\n[BENCHMARK FAILED] Stage: ${currentStage}`);
    console.error(`Error: ${err.message}`);
    console.error(`Total Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    process.exit(1);
  }
}

runBiRefNetBench();
