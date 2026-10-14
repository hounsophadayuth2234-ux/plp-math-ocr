import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";
const TEST_IMAGE_PATH = path.resolve("test-subject.png");
const DOWNLOAD_DIR = path.resolve("test-downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

async function testDownload() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Configure download behavior
  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });

  // 1. Test Module 03 Browser 2x Download
  console.log("=== VERIFYING MODULE 03 DOWNLOAD ===");
  await page.goto(PRODUCTION_URL + "/image-upscaler", { waitUntil: "networkidle2" });
  const fileInput03 = await page.$('input[type="file"]');
  await fileInput03.uploadFile(TEST_IMAGE_PATH);
  await new Promise((r) => setTimeout(r, 600));

  const submitBtn03 = await page.$('button[type="submit"]');
  await submitBtn03.click();
  await page.waitForSelector('[role="slider"]', { timeout: 20000 });

  // Find Download button
  const downloadBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Download 2× PNG")
    );
  });
  await downloadBtn.click();
  console.log("Clicked Download 2× PNG. Waiting for file on disk...");
  await new Promise((r) => setTimeout(r, 2000));

  const downloadedFiles = fs.readdirSync(DOWNLOAD_DIR);
  console.log("Downloaded files in folder:", downloadedFiles);

  for (const f of downloadedFiles) {
    const fPath = path.join(DOWNLOAD_DIR, f);
    const stat = fs.statSync(fPath);
    console.log(`✓ Verified Downloaded Asset: ${f} (${stat.size} bytes)`);
  }

  await browser.close();
}

testDownload().catch(console.error);
