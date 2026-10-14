import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const BROWSER_EXECUTABLE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const FIXTURES_DIR = path.resolve("test-fixtures");
if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR);

async function generateFixtures() {
  console.log("Generating 4 comprehensive quality test fixtures...");
  const browser = await puppeteer.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  // Fixture 1: Portrait with black hair and pink background (#FFF0F5)
  // Already exists as portrait-pink.png, also copy to test-fixtures/01-portrait-black-hair-pink-bg.png
  if (fs.existsSync("portrait-pink.png")) {
    fs.copyFileSync("portrait-pink.png", path.join(FIXTURES_DIR, "01-portrait-black-hair-pink-bg.png"));
    console.log("✓ Fixture 1: 01-portrait-black-hair-pink-bg.png (Ready)");
  }

  // Fixture 2: Person wearing a dark suit with sharp lapels, white shirt, on office background
  const suitSvg = `
    <svg width="480" height="600" viewBox="0 0 480 600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E2E8F0"/>
          <stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>
        <linearGradient id="suitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0F172A"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
      </defs>
      <!-- Background -->
      <rect width="480" height="600" fill="url(#bgGrad)"/>
      
      <!-- Head / Skin -->
      <ellipse cx="240" cy="180" rx="65" ry="85" fill="#FDDEC8"/>
      <!-- Neck -->
      <path d="M 215 250 L 215 320 L 265 320 L 265 250 Z" fill="#E8C3AC"/>
      
      <!-- Hair: Dark short hair -->
      <path d="M 170 170 Q 170 100 240 95 Q 310 100 310 170 Q 305 130 240 120 Q 175 130 170 170 Z" fill="#18181B"/>
      <!-- Sideburns -->
      <path d="M 172 165 L 178 205 L 185 200 L 180 165 Z" fill="#18181B"/>
      <path d="M 308 165 L 302 205 L 295 200 L 300 165 Z" fill="#18181B"/>
      
      <!-- Facial Features -->
      <ellipse cx="215" cy="175" rx="5" ry="4" fill="#27272A"/>
      <ellipse cx="265" cy="175" rx="5" ry="4" fill="#27272A"/>
      <path d="M 238 185 L 235 205 L 245 205" stroke="#D19875" stroke-width="2.5" fill="none"/>
      <path d="M 225 225 Q 240 232 255 225" stroke="#C2410C" stroke-width="2" fill="none"/>

      <!-- White Dress Shirt Collar -->
      <polygon points="215,310 240,350 210,360" fill="#FFFFFF" stroke="#CBD5E1"/>
      <polygon points="265,310 240,350 270,360" fill="#FFFFFF" stroke="#CBD5E1"/>
      <polygon points="230,340 250,340 245,460 235,460" fill="#FFFFFF"/>
      
      <!-- Red Tie -->
      <polygon points="236,345 244,345 248,460 240,480 232,460" fill="#991B1B"/>

      <!-- Black Suit Shoulders & Jacket -->
      <path d="M 210 320 L 70 380 L 40 600 L 440 600 L 410 380 L 270 320 L 255 365 L 240 450 L 225 365 Z" fill="url(#suitGrad)"/>
      <!-- Suit Lapels (Sharp Dark Gray Accents) -->
      <path d="M 215 320 L 180 430 L 240 460 L 220 370 Z" fill="#1E293B" stroke="#0F172A" stroke-width="1.5"/>
      <path d="M 265 320 L 300 430 L 240 460 L 260 370 Z" fill="#1E293B" stroke="#0F172A" stroke-width="1.5"/>
    </svg>
  `;
  await page.setContent(suitSvg);
  const suitEl = await page.$("svg");
  const suitPath = path.join(FIXTURES_DIR, "02-portrait-dark-suit.png");
  await suitEl.screenshot({ path: suitPath, omitBackground: false });
  console.log("✓ Fixture 2: 02-portrait-dark-suit.png (Created)");

  // Fixture 3: Illustration containing multiple animals with thin legs and narrow gaps
  // A giraffe and a flamingo with 2px-wide legs and narrow gaps between them
  const animalsSvg = `
    <svg width="600" height="500" viewBox="0 0 600 500" xmlns="http://www.w3.org/2000/svg">
      <!-- Background: Bright savanna sky & field -->
      <rect width="600" height="500" fill="#FEF08A"/>
      <circle cx="500" cy="90" r="45" fill="#FDE047"/>

      <!-- Animal 1: Giraffe with thin legs and long neck -->
      <g id="giraffe">
        <!-- Body -->
        <ellipse cx="200" cy="300" rx="60" ry="40" fill="#D97706"/>
        <!-- Spots -->
        <circle cx="180" cy="290" r="10" fill="#92400E"/>
        <circle cx="215" cy="305" r="8" fill="#92400E"/>
        <circle cx="200" cy="320" r="7" fill="#92400E"/>
        <!-- Neck -->
        <polygon points="155,290 175,305 130,120 115,125" fill="#D97706"/>
        <!-- Head -->
        <ellipse cx="120" cy="115" rx="18" ry="12" fill="#D97706"/>
        <polygon points="112,106 108,90 114,92" fill="#92400E"/>
        <polygon points="118,106 118,88 123,90" fill="#92400E"/>
        <circle cx="112" cy="112" r="2.5" fill="#1E293B"/>

        <!-- Four ULTRA-THIN Legs (3px wide) with narrow gaps -->
        <!-- Front Leg 1 -->
        <line x1="165" y1="335" x2="165" y2="470" stroke="#B45309" stroke-width="3" stroke-linecap="round"/>
        <!-- Front Leg 2 (Narrow gap of 6px!) -->
        <line x1="174" y1="338" x2="174" y2="470" stroke="#92400E" stroke-width="3" stroke-linecap="round"/>
        <!-- Back Leg 1 -->
        <line x1="235" y1="335" x2="235" y2="470" stroke="#B45309" stroke-width="3" stroke-linecap="round"/>
        <!-- Back Leg 2 (Narrow gap of 7px!) -->
        <line x1="245" y1="338" x2="245" y2="470" stroke="#92400E" stroke-width="3" stroke-linecap="round"/>
        <!-- Hooves -->
        <rect x="162" y="468" width="6" height="4" fill="#1E293B"/>
        <rect x="171" y="468" width="6" height="4" fill="#1E293B"/>
        <rect x="232" y="468" width="6" height="4" fill="#1E293B"/>
        <rect x="242" y="468" width="6" height="4" fill="#1E293B"/>
      </g>

      <!-- Animal 2: Flamingo with ultra-thin stilt legs (2px wide) -->
      <g id="flamingo">
        <!-- Body -->
        <ellipse cx="400" cy="330" rx="35" ry="25" fill="#F43F5E"/>
        <!-- Wing feathers -->
        <path d="M 380 325 Q 405 315 425 335 Q 400 345 380 325 Z" fill="#E11D48"/>
        <!-- S-Curved Neck -->
        <path d="M 375 325 C 340 300 340 240 365 210 C 375 195 385 200 380 215" stroke="#F43F5E" stroke-width="6" fill="none" stroke-linecap="round"/>
        <!-- Head & Beak -->
        <circle cx="380" cy="215" r="9" fill="#F43F5E"/>
        <path d="M 387 215 L 402 222 L 398 226 L 387 221 Z" fill="#1E293B"/>
        <circle cx="378" cy="213" r="1.5" fill="#FFFFFF"/>

        <!-- Standing Leg (Thin 2.5px line!) -->
        <line x1="395" y1="355" x2="395" y2="470" stroke="#BE123C" stroke-width="2.5"/>
        <!-- Bent Leg (creating triangular narrow gap) -->
        <polyline points="405,355 420,405 396,415" stroke="#9F1239" stroke-width="2.5" fill="none"/>
        <polygon points="390,470 405,470 395,467" fill="#BE123C"/>
      </g>
    </svg>
  `;
  await page.setContent(animalsSvg);
  const animalsEl = await page.$("svg");
  const animalsPath = path.join(FIXTURES_DIR, "03-animals-thin-legs-gaps.png");
  await animalsEl.screenshot({ path: animalsPath, omitBackground: false });
  console.log("✓ Fixture 3: 03-animals-thin-legs-gaps.png (Created)");

  // Fixture 4: Complex colorful high-frequency background with a subject
  const colorfulSvg = `
    <svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <!-- Complex multi-color gradient + geometric pattern background -->
      <defs>
        <radialGradient id="rainbow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#EC4899"/>
          <stop offset="25%" stop-color="#8B5CF6"/>
          <stop offset="50%" stop-color="#3B82F6"/>
          <stop offset="75%" stop-color="#10B981"/>
          <stop offset="100%" stop-color="#F59E0B"/>
        </radialGradient>
      </defs>
      <rect width="500" height="500" fill="url(#rainbow)"/>
      <!-- High frequency background stripes -->
      <g stroke="rgba(255,255,255,0.25)" stroke-width="2">
        <line x1="0" y1="50" x2="500" y2="50"/>
        <line x1="0" y1="100" x2="500" y2="100"/>
        <line x1="0" y1="150" x2="500" y2="150"/>
        <line x1="0" y1="200" x2="500" y2="200"/>
        <line x1="0" y1="250" x2="500" y2="250"/>
        <line x1="0" y1="300" x2="500" y2="300"/>
        <line x1="0" y1="350" x2="500" y2="350"/>
        <line x1="0" y1="400" x2="500" y2="400"/>
        <line x1="0" y1="450" x2="500" y2="450"/>
      </g>

      <!-- Foreground Subject: Sleek Cybernetic Drone with thin antennas and camera lens -->
      <g id="drone">
        <!-- Main Chassis -->
        <rect x="180" y="210" width="140" height="80" rx="20" fill="#09090B" stroke="#00F0FF" stroke-width="3"/>
        <circle cx="250" cy="250" r="26" fill="#18181B" stroke="#00F0FF" stroke-width="2"/>
        <circle cx="250" cy="250" r="14" fill="#00F0FF" opacity="0.8"/>
        <circle cx="250" cy="250" r="6" fill="#FFFFFF"/>

        <!-- Thin Antennas (1.5px and 2px) -->
        <line x1="210" y1="210" x2="170" y2="130" stroke="#00F0FF" stroke-width="2"/>
        <circle cx="170" cy="130" r="4" fill="#00F0FF"/>
        
        <line x1="290" y1="210" x2="330" y2="130" stroke="#00F0FF" stroke-width="2"/>
        <circle cx="330" cy="130" r="4" fill="#00F0FF"/>

        <!-- Rotor Arms with Narrow Gaps -->
        <!-- Left Arm -->
        <line x1="180" y1="250" x2="100" y2="250" stroke="#27272A" stroke-width="6"/>
        <ellipse cx="100" cy="250" rx="35" ry="5" fill="#A1A1AA" stroke="#71717A" stroke-width="1.5"/>

        <!-- Right Arm -->
        <line x1="320" y1="250" x2="400" y2="250" stroke="#27272A" stroke-width="6"/>
        <ellipse cx="400" cy="250" rx="35" ry="5" fill="#A1A1AA" stroke="#71717A" stroke-width="1.5"/>

        <!-- Landing Skids (Narrow gap) -->
        <path d="M 200 290 L 190 350 L 230 350" stroke="#3F3F46" stroke-width="3" fill="none"/>
        <path d="M 300 290 L 310 350 L 270 350" stroke="#3F3F46" stroke-width="3" fill="none"/>
      </g>
    </svg>
  `;
  await page.setContent(colorfulSvg);
  const colorEl = await page.$("svg");
  const colorPath = path.join(FIXTURES_DIR, "04-complex-colorful-bg.png");
  await colorEl.screenshot({ path: colorPath, omitBackground: false });
  console.log("✓ Fixture 4: 04-complex-colorful-bg.png (Created)");

  await browser.close();
  console.log("\n=== ALL 4 QUALITY TEST FIXTURES READY IN test-fixtures/ ===");
}

generateFixtures().catch(e => {
  console.error("Fixture generation failed:", e);
  process.exit(1);
});
