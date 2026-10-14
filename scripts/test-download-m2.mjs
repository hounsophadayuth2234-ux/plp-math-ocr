import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";
const TEST_IMAGE_PATH = path.resolve("test-subject.png");
const DOWNLOAD_DIR = path.resolve("test-downloads-m2");

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

async function testDownloadM2() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-features=WebGPU"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DOWNLOAD_DIR,
  });

  console.log("=== VERIFYING MODULE 02 DOWNLOAD WORKFLOW ===");
  await page.goto(PRODUCTION_URL + "/bg-remover", { waitUntil: "networkidle2" });
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(TEST_IMAGE_PATH);
  await new Promise((r) => setTimeout(r, 600));

  const buttons = await page.$$("button");
  let ch01Button = null;
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.textContent, b);
    if (text && text.includes("CH-01")) {
      ch01Button = b;
      break;
    }
  }

  await ch01Button.click();
  console.log("Triggered segmentation. Waiting for output deck...");
  await page.waitForFunction(
    () => document.body.innerText.includes("COMPOSITE RENDER DECK"),
    { timeout: 90000, polling: 500 }
  );

  // Click Download White PNG
  const downloadWhiteBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("DOWNLOAD // PNG WHITE")
    );
  });
  await downloadWhiteBtn.click();
  console.log("Clicked DOWNLOAD // PNG WHITE");
  await new Promise((r) => setTimeout(r, 1500));

  // Click Transparent PNG
  const downloadTransBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("TRANSPARENT PNG")
    );
  });
  await downloadTransBtn.click();
  console.log("Clicked TRANSPARENT PNG");
  await new Promise((r) => setTimeout(r, 1500));

  const files = fs.readdirSync(DOWNLOAD_DIR);
  console.log("Downloaded files in folder:", files);

  for (const f of files) {
    const p = path.join(DOWNLOAD_DIR, f);
    const stat = fs.statSync(p);
    console.log(`✓ Verified M02 Download: ${f} (${stat.size} bytes)`);
  }

  await browser.close();
}

testDownloadM2().catch(console.error);
