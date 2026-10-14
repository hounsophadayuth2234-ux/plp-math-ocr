import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app/image-upscaler";
const TEST_IMAGE_PATH = path.resolve("portrait-pink.png");

async function diag() {
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

  const fileInput = await page.$('input[type="file"]');
  console.log("Found fileInput:", !!fileInput);
  await fileInput.uploadFile(TEST_IMAGE_PATH);
  await new Promise((r) => setTimeout(r, 1000));

  const state1 = await page.evaluate(() => {
    const submitBtn = document.querySelector('button[type="submit"]');
    return {
      submitBtnText: submitBtn?.innerText,
      submitBtnDisabled: submitBtn?.disabled,
      hasPreviewImg: !!document.querySelector('img[alt="Original upload preview"]'),
    };
  });
  console.log("State after file upload:", state1);

  // Submit via form.requestSubmit()
  console.log("Submitting form...");
  await page.evaluate(() => {
    const form = document.querySelector("form");
    form.requestSubmit();
  });

  // Give it up to 5 seconds and log page text
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const info = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")).map((b) => b.innerText);
      const err = document.querySelector(".text-rose-300")?.innerText;
      return { btns, err, textSnippet: document.body.innerText.slice(0, 300) };
    });
    console.log(`[Tick ${i}]`, info);
    if (info.btns.some((b) => b.includes("Download Result"))) {
      console.log("Found Download Result button!");
      break;
    }
  }

  const state2 = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasDownload: Array.from(document.querySelectorAll("button")).some(b => b.innerText.includes("Download Result")),
      hasBadge: text.includes("Enhanced resize — not AI super-resolution"),
      hasSlider: !!document.querySelector('[role="slider"]') || document.querySelectorAll('img').length >= 2,
    };
  });
  console.log("State after browser enhance:", state2);

  // Now test Real-ESRGAN (AI)
  console.log("Switching to Real-ESRGAN (AI)...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const aiBtn = btns.find((b) => b.innerText.includes("Real-ESRGAN (AI)"));
    aiBtn.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  console.log("Submitting AI form without demo...");
  await page.evaluate(() => {
    const form = document.querySelector("form");
    form.requestSubmit();
  });

  await page.waitForFunction(
    () => document.body.innerText.includes("No Real-ESRGAN AI provider is configured"),
    { timeout: 15000 }
  );
  console.log("✓ Correctly caught 422 error guidance message!");

  // Now test Demo Mode
  console.log("Enabling Demo Preview mode...");
  await page.evaluate(() => {
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  console.log("Submitting with demo preview...");
  await page.evaluate(() => {
    const form = document.querySelector("form");
    form.requestSubmit();
  });

  await page.waitForFunction(
    () => document.body.innerText.includes("DEMO PREVIEW"),
    { timeout: 15000 }
  );
  console.log("✓ Caught explicit Demo Preview badge!");

  await browser.close();
  console.log("DIAG COMPLETED SUCCESSFULLY!");
}

diag().catch(console.error);
