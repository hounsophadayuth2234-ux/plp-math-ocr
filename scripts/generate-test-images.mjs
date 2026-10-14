import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BROWSER_EXECUTABLE = fs.existsSync(CHROME_PATH) ? CHROME_PATH : EDGE_PATH;

async function generateTestImages() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // 1. Product Photo: Luxury Perfume / Cosmetic Glass Bottle on a studio background
  console.log("Generating test-product.png...");
  await page.setViewport({ width: 600, height: 600 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          overflow: hidden;
        }
        .podium {
          position: absolute;
          bottom: 70px;
          width: 380px;
          height: 50px;
          background: #94a3b8;
          border-radius: 50%;
          box-shadow: 0 20px 40px rgba(0,0,0,0.25);
        }
        .bottle {
          position: relative;
          z-index: 2;
          width: 180px;
          height: 280px;
          background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 50%, #1e3a8a 100%);
          border-radius: 36px 36px 20px 20px;
          box-shadow: inset 10px 0 20px rgba(255,255,255,0.4), inset -10px 0 20px rgba(0,0,0,0.5), 0 25px 35px rgba(0,0,0,0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .cap {
          position: absolute;
          top: -45px;
          width: 70px;
          height: 50px;
          background: linear-gradient(90deg, #f59e0b, #fef3c7, #d97706);
          border-radius: 8px 8px 0 0;
          box-shadow: 0 -4px 10px rgba(0,0,0,0.2);
        }
        .label {
          background: #ffffff;
          padding: 18px 24px;
          border-radius: 8px;
          font-family: 'Helvetica Neue', sans-serif;
          font-weight: 900;
          letter-spacing: 3px;
          color: #0f172a;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          text-align: center;
        }
        .label small {
          display: block;
          font-size: 8px;
          letter-spacing: 1px;
          color: #64748b;
          margin-top: 4px;
        }
      </style>
    </head>
    <body>
      <div class="podium"></div>
      <div class="bottle">
        <div class="cap"></div>
        <div class="label">
          NEXUS
          <small>EAU DE PARFUM</small>
        </div>
      </div>
    </body>
    </html>
  `);
  await page.screenshot({ path: path.resolve("test-product.png") });
  console.log("Saved test-product.png");

  // 2. Image with narrow edges and small objects: Wireframe glasses with fine temples and narrow nose bridge
  console.log("Generating test-narrow-edges.png...");
  await page.setViewport({ width: 650, height: 450 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
        }
        svg {
          filter: drop-shadow(0 15px 25px rgba(0,0,0,0.18));
        }
      </style>
    </head>
    <body>
      <svg width="560" height="280" viewBox="0 0 560 280">
        <!-- Left Frame Rim (Narrow circle) -->
        <circle cx="160" cy="140" r="90" fill="none" stroke="#0f172a" stroke-width="5" />
        <circle cx="160" cy="140" r="86" fill="rgba(224, 242, 254, 0.35)" stroke="#38bdf8" stroke-width="1.5" />
        
        <!-- Right Frame Rim (Narrow circle) -->
        <circle cx="400" cy="140" r="90" fill="none" stroke="#0f172a" stroke-width="5" />
        <circle cx="400" cy="140" r="86" fill="rgba(224, 242, 254, 0.35)" stroke="#38bdf8" stroke-width="1.5" />
        
        <!-- Narrow Bridge between rims -->
        <path d="M 250 120 Q 280 100 310 120" fill="none" stroke="#0f172a" stroke-width="5" stroke-linecap="round" />
        <path d="M 252 140 Q 280 130 308 140" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round" />
        
        <!-- Left Thin Temple / Arm -->
        <path d="M 70 135 Q 30 130 10 105" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
        
        <!-- Right Thin Temple / Arm -->
        <path d="M 490 135 Q 530 130 550 105" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
        
        <!-- Small Nose Pads with thin wire connectors -->
        <path d="M 235 155 L 225 175" stroke="#0f172a" stroke-width="2.5" />
        <ellipse cx="225" cy="180" rx="4" ry="9" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5" />
        
        <path d="M 325 155 L 335 175" stroke="#0f172a" stroke-width="2.5" />
        <ellipse cx="335" cy="180" rx="4" ry="9" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5" />
      </svg>
    </body>
    </html>
  `);
  await page.screenshot({ path: path.resolve("test-narrow-edges.png") });
  console.log("Saved test-narrow-edges.png");

  await browser.close();
}

generateTestImages().catch(console.error);
