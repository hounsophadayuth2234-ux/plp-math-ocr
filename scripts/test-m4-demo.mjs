import puppeteer from "puppeteer-core";
import fs from "fs";

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PRODUCTION_URL = "https://ai-toolkit-hub-nu.vercel.app";

async function testM4Demo() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log("=== TESTING MODULE 04 DEMO PREVIEW MODE ===");
  await page.goto(PRODUCTION_URL + "/image-generator", { waitUntil: "networkidle2" });

  const promptInput = await page.$("textarea#prompt");
  await promptInput.type("An educational diagram of the water cycle");

  // Check the Demo Preview checkbox
  const demoCheckbox = await page.$('input[type="checkbox"]');
  await demoCheckbox.click();
  console.log("Checked 'Enable Demo Preview Mode'");

  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();
  console.log("Clicked Synthesize...");

  await page.waitForSelector(".group.relative.overflow-hidden", { timeout: 15000 });
  console.log("✓ Session Gallery rendered demo item!");

  const cardInfo = await page.evaluate(() => {
    const badge = document.querySelector(".group.relative.overflow-hidden span");
    const img = document.querySelector(".group.relative.overflow-hidden img");
    return {
      badgeText: badge ? badge.textContent.trim() : null,
      imgSrcStart: img ? img.src.slice(0, 30) : null,
    };
  });
  console.log("Demo Card Info:", cardInfo);

  await browser.close();
}

testM4Demo().catch(console.error);
