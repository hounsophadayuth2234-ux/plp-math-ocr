import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";
const TEST_IMAGE_PATH = path.resolve("test-subject.png");

async function checkUpscaler() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto(`${PRODUCTION_URL}/image-upscaler`, { waitUntil: "networkidle2" });
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(TEST_IMAGE_PATH);
  await new Promise((r) => setTimeout(r, 600));

  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();

  await page.waitForFunction(
    () => document.body.innerText.includes("Enhanced resize — not AI super-resolution"),
    { timeout: 15000 }
  );

  const html = await page.evaluate(() => {
    const resultsDiv = document.querySelector(".space-y-4");
    return {
      text: document.body.innerText,
      sliderCount: document.querySelectorAll('[role="slider"]').length,
      imgTags: Array.from(document.querySelectorAll("img")).map((i) => ({ alt: i.alt, src: i.src.slice(0, 40) })),
    };
  });

  console.log("Upscaler DOM State:", html);
  await page.screenshot({ path: "upscaler-result.png" });
  console.log("Saved upscaler-result.png");
  await browser.close();
}

checkUpscaler().catch(console.error);
