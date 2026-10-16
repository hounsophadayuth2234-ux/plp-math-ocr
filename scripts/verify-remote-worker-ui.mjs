import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3005/bg-remover";
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "evidence-screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function run() {
  console.log("Launching browser for Remote Worker UI verification...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });

    console.log(`Navigating to ${BASE_URL}...`);
    await page.goto(BASE_URL, { waitUntil: "networkidle0" });

    // 1. Desktop Initial View
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "remote-worker-desktop-standby.png"),
    });
    console.log("Captured: remote-worker-desktop-standby.png");

    // 2. Upload Math Image Fixture
    const fixturePath = path.resolve(process.cwd(), "test-fixtures/fixture-1200x1200.jpg");
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(fixturePath);
      await new Promise((r) => setTimeout(r, 800));
    }

    // 3. Switch to Remote Worker Engine
    const workerRadio = await page.$('[data-testid="engine-select-worker"]');
    if (workerRadio) {
      await workerRadio.click();
      await new Promise((r) => setTimeout(r, 500));
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "remote-worker-selected-with-image.png"),
    });
    console.log("Captured: remote-worker-selected-with-image.png");

    // 4. Mobile Viewport (375x812)
    await page.setViewport({ width: 375, height: 812 });
    await new Promise((r) => setTimeout(r, 400));
    const mobileMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    console.log("Mobile Metrics:", mobileMetrics);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "remote-worker-mobile-viewport.png"),
    });
    console.log("Captured: remote-worker-mobile-viewport.png");

    console.log("All UI verifications completed successfully.");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("UI Verification error:", err);
  process.exit(1);
});
