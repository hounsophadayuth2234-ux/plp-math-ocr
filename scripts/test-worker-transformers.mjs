import puppeteer from 'puppeteer-core';

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function testWorker() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto("about:blank");

  page.on("console", msg => console.log("  [Browser Log]", msg.text()));

  const result = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const workerCode = `
        importScripts('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js');
        self.onmessage = async (e) => {
          if (e.data.type === 'PING') {
            const hasTransformers = typeof self.transformers !== 'undefined';
            self.postMessage({ ok: hasTransformers, version: self.transformers?.version });
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (e) => {
        resolve(e.data);
        worker.terminate();
      };
      worker.onerror = (err) => {
        reject(err.message);
      };
      worker.postMessage({ type: 'PING' });
    });
  });

  console.log("Worker test result:", result);
  await browser.close();
}

testWorker().catch(e => console.error("Worker test error:", e));
