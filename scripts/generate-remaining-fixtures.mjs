import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function generateFixtures() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  // 1. Dark suit on light background
  console.log("Generating test-dark-suit.png...");
  await page.setViewport({ width: 500, height: 600 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          background: #f1f5f9;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          height: 100vh;
          overflow: hidden;
        }
        .torso {
          width: 320px;
          height: 440px;
          background: #0f172a;
          border-radius: 80px 80px 0 0;
          position: relative;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }
        .head {
          position: absolute;
          top: -120px;
          left: 85px;
          width: 150px;
          height: 180px;
          background: #fed7aa;
          border-radius: 75px;
        }
        .hair {
          position: absolute;
          top: -135px;
          left: 75px;
          width: 170px;
          height: 100px;
          background: #18181b;
          border-radius: 85px 85px 20px 20px;
        }
        .collar {
          position: absolute;
          top: 40px;
          left: 110px;
          width: 100px;
          height: 90px;
          background: #ffffff;
          clip-path: polygon(0 0, 100% 0, 50% 100%);
        }
        .tie {
          position: absolute;
          top: 60px;
          left: 145px;
          width: 30px;
          height: 180px;
          background: #b91c1c;
          clip-path: polygon(20% 0, 80% 0, 100% 80%, 50% 100%, 0 80%);
        }
        .lapel-left {
          position: absolute;
          top: 40px;
          left: 40px;
          width: 70px;
          height: 220px;
          background: #1e293b;
          clip-path: polygon(0 0, 100% 40%, 40% 100%, 0 100%);
        }
        .lapel-right {
          position: absolute;
          top: 40px;
          right: 40px;
          width: 70px;
          height: 220px;
          background: #1e293b;
          clip-path: polygon(100% 0, 0 40%, 60% 100%, 100% 100%);
        }
      </style>
    </head>
    <body>
      <div class="torso">
        <div class="hair"></div>
        <div class="head"></div>
        <div class="collar"></div>
        <div class="tie"></div>
        <div class="lapel-left"></div>
        <div class="lapel-right"></div>
      </div>
    </body>
    </html>
  `);
  await page.screenshot({ path: "test-dark-suit.png" });

  // 2. Illustration with animals and thin legs (e.g. flamingo & deer with thin legs)
  console.log("Generating test-animals-legs.png...");
  await page.setViewport({ width: 600, height: 500 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          background: #e0f2fe;
          display: flex;
          align-items: center;
          justify-content: space-around;
          height: 100vh;
          overflow: hidden;
        }
        /* Flamingo */
        .flamingo {
          position: relative;
          width: 200px;
          height: 400px;
        }
        .f-body {
          position: absolute;
          top: 120px;
          left: 40px;
          width: 120px;
          height: 90px;
          background: #f43f5e;
          border-radius: 60px 40px 60px 50px;
        }
        .f-neck {
          position: absolute;
          top: 40px;
          left: 110px;
          width: 24px;
          height: 110px;
          background: #f43f5e;
          border-radius: 20px 20px 0 0;
          transform: rotate(-15deg);
        }
        .f-head {
          position: absolute;
          top: 25px;
          left: 125px;
          width: 45px;
          height: 35px;
          background: #f43f5e;
          border-radius: 25px;
        }
        .f-beak {
          position: absolute;
          top: 35px;
          left: 155px;
          width: 35px;
          height: 18px;
          background: #18181b;
          border-radius: 0 15px 15px 0;
        }
        /* Thin legs */
        .f-leg-1 {
          position: absolute;
          top: 200px;
          left: 80px;
          width: 4px;
          height: 180px;
          background: #e11d48;
        }
        .f-leg-2 {
          position: absolute;
          top: 200px;
          left: 105px;
          width: 4px;
          height: 180px;
          background: #e11d48;
        }

        /* Deer / Fawn */
        .deer {
          position: relative;
          width: 220px;
          height: 380px;
        }
        .d-body {
          position: absolute;
          top: 130px;
          left: 20px;
          width: 160px;
          height: 90px;
          background: #d97706;
          border-radius: 50px;
        }
        .d-neck {
          position: absolute;
          top: 60px;
          left: 130px;
          width: 35px;
          height: 90px;
          background: #d97706;
          transform: rotate(20deg);
          border-radius: 15px;
        }
        .d-head {
          position: absolute;
          top: 40px;
          left: 150px;
          width: 50px;
          height: 40px;
          background: #d97706;
          border-radius: 20px;
        }
        .d-antler {
          position: absolute;
          top: 10px;
          left: 165px;
          width: 6px;
          height: 40px;
          background: #78350f;
          border-radius: 3px;
        }
        /* 4 thin legs */
        .d-leg-1 {
          position: absolute;
          top: 210px;
          left: 40px;
          width: 5px;
          height: 160px;
          background: #b45309;
        }
        .d-leg-2 {
          position: absolute;
          top: 210px;
          left: 60px;
          width: 5px;
          height: 160px;
          background: #92400e;
        }
        .d-leg-3 {
          position: absolute;
          top: 210px;
          left: 130px;
          width: 5px;
          height: 160px;
          background: #b45309;
        }
        .d-leg-4 {
          position: absolute;
          top: 210px;
          left: 150px;
          width: 5px;
          height: 160px;
          background: #92400e;
        }
      </style>
    </head>
    <body>
      <div class="flamingo">
        <div class="f-beak"></div>
        <div class="f-head"></div>
        <div class="f-neck"></div>
        <div class="f-body"></div>
        <div class="f-leg-1"></div>
        <div class="f-leg-2"></div>
      </div>
      <div class="deer">
        <div class="d-antler"></div>
        <div class="d-head"></div>
        <div class="d-neck"></div>
        <div class="d-body"></div>
        <div class="d-leg-1"></div>
        <div class="d-leg-2"></div>
        <div class="d-leg-3"></div>
        <div class="d-leg-4"></div>
      </div>
    </body>
    </html>
  `);
  await page.screenshot({ path: "test-animals-legs.png" });

  await browser.close();
  console.log("Fixtures generated successfully.");
}

generateFixtures().catch(console.error);
