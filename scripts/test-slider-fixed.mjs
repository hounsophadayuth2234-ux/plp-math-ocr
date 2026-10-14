import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";
const TEST_IMAGE_PATH = path.resolve("test-subject.png");

async function test() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto(PRODUCTION_URL + "/image-upscaler", { waitUntil: "networkidle2" });
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(TEST_IMAGE_PATH);
  await new Promise((r) => setTimeout(r, 1000));

  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();
  console.log("Clicked Enhance. Waiting for slider to appear...");

  await page.waitForSelector('[role="slider"]', { timeout: 20000 });
  console.log("✓ Before/After Slider found on page!");

  const sliderInfo = await page.evaluate(() => {
    const s = document.querySelector('[role="slider"]');
    const imgs = Array.from(s.querySelectorAll("img")).map((i) => ({
      alt: i.alt,
      srcStart: i.src.slice(0, 35),
    }));
    const downloadBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Download")
    );
    const badge = document.querySelector("span.ring-1");
    return {
      imgs,
      downloadText: downloadBtn ? downloadBtn.textContent.trim() : null,
      badgeText: badge ? badge.textContent.trim() : null,
    };
  });

  console.log("Slider & Download info:", sliderInfo);
  await browser.close();
}

test().catch((e) => console.error("Error:", e));
