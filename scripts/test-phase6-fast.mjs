import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app/image-generator";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on("console", (msg) => console.log(`  [Console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("  [Page Error]", err.message));

  console.log("Navigating to", PRODUCTION_URL);
  await page.goto(PRODUCTION_URL, { waitUntil: "networkidle2" });

  // 1. Enter prompt
  const promptInput = await page.$('textarea[id="prompt"]');
  await promptInput.type("Glowing fractal crystal floating in deep space");
  await new Promise((r) => setTimeout(r, 400));

  // 2. Submit without demo (verify provider error)
  console.log("Submitting without demo mode...");
  await page.evaluate(() => {
    document.querySelector("form").requestSubmit();
  });

  console.log("Waiting for Execution Error card to appear...");
  await page.waitForFunction(
    () => {
      const errEl = document.querySelector(".text-rose-200");
      return errEl && errEl.innerText.includes("Execution Error");
    },
    { timeout: 25000 }
  );

  const errText = await page.evaluate(() => {
    return document.querySelector(".text-rose-300")?.innerText;
  });
  console.log("✓ Caught expected provider error:", errText);

  // 3. Enable demo mode via checkbox
  console.log("Toggling Demo Preview Mode checkbox...");
  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) {
      cb.click();
    }
  });

  const isChecked = await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]');
    return cb?.checked;
  });
  console.log("Checkbox checked state:", isChecked);

  // 4. Submit with demo mode enabled
  console.log("Submitting with Demo Mode enabled...");
  await page.evaluate(() => {
    document.querySelector("form").requestSubmit();
  });

  console.log("Waiting for gallery item to appear...");
  await page.waitForFunction(
    () => document.querySelectorAll('img[alt^="Generated image"]').length > 0,
    { timeout: 20000 }
  );

  const galleryState = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img[alt^="Generated image"]')).map((img) => ({
      alt: img.alt,
      srcPreview: img.src.slice(0, 60),
    }));
    const badges = Array.from(document.querySelectorAll(".border-purple-500\\/40")).map((b) => b.innerText);
    const hasDownloadBtn = Array.from(document.querySelectorAll("button")).some((b) => b.innerText.includes("Download"));
    return { images, badges, hasDownloadBtn };
  });

  console.log("✓ Gallery Result:", galleryState);
  await browser.close();
  console.log("FAST TEST PASSED!");
}

run().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
