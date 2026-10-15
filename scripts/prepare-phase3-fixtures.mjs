import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function prepareFixtures() {
  console.log("Generating Phase 3 fixtures...");

  // 1. Large portrait: 1600 x 2000 px
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 2000 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          background: #ffe4e6; /* Soft light pink background */
          display: flex;
          align-items: flex-end;
          justify-content: center;
          height: 100vh;
          overflow: hidden;
        }
        .torso {
          width: 900px;
          height: 1200px;
          background: #111827; /* Dark clothing */
          border-radius: 260px 260px 0 0;
          position: relative;
        }
        .head {
          position: absolute;
          top: -450px;
          left: 250px;
          width: 400px;
          height: 520px;
          background: #fde047; /* Light skin */
          border-radius: 200px;
        }
        .hair {
          position: absolute;
          top: -550px;
          left: 170px;
          width: 560px;
          height: 380px;
          background: #000000; /* Black hair */
          border-radius: 280px 280px 40px 40px;
        }
      </style>
    </head>
    <body>
      <div class="torso">
        <div class="hair"></div>
        <div class="head"></div>
      </div>
    </body>
    </html>
  `);

  await page.screenshot({ path: path.resolve("test-large-portrait.png"), type: "png" });
  await browser.close();
  console.log("✓ Created test-large-portrait.png (1600x2000)");

  // 2. Unsupported file
  fs.writeFileSync(path.resolve("test-unsupported.txt"), "This is an unsupported plain text file.");
  console.log("✓ Created test-unsupported.txt");

  // 3. Corrupted image
  const fakeBytes = Buffer.from("NOT_A_PNG_CORRUPTED_BYTES_HEADER_1234567890");
  fs.writeFileSync(path.resolve("test-corrupted.png"), fakeBytes);
  console.log("✓ Created test-corrupted.png");
}

prepareFixtures().catch(console.error);
