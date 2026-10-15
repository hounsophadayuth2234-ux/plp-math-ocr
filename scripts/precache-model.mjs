import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;
const TARGET_URL = process.env.TEST_TARGET_URL || "http://localhost:3005/bg-remover";

async function main() {
  console.log("Pre-caching isnet_fp16 model in .puppeteer-cache...");
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    userDataDir: path.resolve(".puppeteer-cache"),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("bg-remover") || text.includes("fetch")) {
        console.log("  [Browser]", text);
      }
    });

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[type="file"]');

    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(path.resolve("portrait-pink.png"));
    await new Promise((r) => setTimeout(r, 1000));

    // Switch to Clean Cut mode (which has a longer timeout)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const cleanCutBtn = btns.find((b) => b.innerText.includes("Clean Cut"));
      if (cleanCutBtn) cleanCutBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Click Run Final Clean Cut
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const execBtn = btns.find((b) => b.innerText.includes("RUN FINAL CLEAN CUT"));
      if (execBtn) execBtn.click();
    });

    console.log("Waiting for model download and segmentation...");
    await page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll("button"));
        return btns.some(
          (b) => b.innerText.includes("WHITE") || b.innerText.includes("TRANSPARENT")
        );
      },
      { timeout: 70000 }
    );

    console.log("SUCCESS: isnet_fp16 model successfully downloaded and cached in .puppeteer-cache!");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Pre-cache error:", err);
  process.exit(1);
});
