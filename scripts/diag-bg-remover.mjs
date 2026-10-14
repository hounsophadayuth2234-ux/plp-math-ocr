import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function diag() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-features=WebGPU"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on("console", (msg) => console.log(`[Console ${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.error("[Page Error]", err.message));

  await page.goto("https://ai-toolkit-hub-nu.vercel.app/bg-remover", { waitUntil: "networkidle2" });
  const input = await page.$('input[type="file"]');
  await input.uploadFile(path.resolve("portrait-pink.png"));
  await new Promise(r => setTimeout(r, 1200));

  console.log("Triggering runBtn.click() via evaluate...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const runBtn = btns.find(b => b.innerText.includes("RUN FAST PREVIEW"));
    if (runBtn) runBtn.click();
  });

  // Watch for state changes over next 15 seconds
  for (let i = 1; i <= 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await page.evaluate((sec) => {
      const isScanning = !!document.querySelector(".animate-laser-scan") || document.body.innerText.includes("SEGMENTING") || document.body.innerText.includes("PREPARING");
      const hasColorStudio = document.body.innerText.includes("Color Studio") || document.body.innerText.includes("កាត់រូបដាក់សំណួរ");
      const isProcessing = document.body.innerText.includes("CANCEL");
      return { second: sec, isScanning, hasColorStudio, isProcessing };
    }, i);
    console.log(`Sec ${i}:`, status);
    if (status.hasColorStudio) break;
  }

  await browser.close();
}

diag().catch(console.error);
