import sharp from "sharp";
import fs from "fs";

const svg = `
<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="50" y="70" font-family="'Kantumruy Pro', 'Khmer OS', sans-serif" font-size="28" font-weight="bold" fill="#1e293b">លំហាត់ទី១៖ ចូរគណនា</text>
  <text x="50" y="160" font-family="'Times New Roman', serif" font-size="42" font-weight="bold" fill="#0f172a">2 + 3 = 5</text>
  <text x="50" y="230" font-family="'Kantumruy Pro', 'Khmer OS', sans-serif" font-size="20" fill="#475569">គណនាលទ្ធផលនៃប្រមាណវិធីបូក</text>
</svg>
`;

fs.mkdirSync("test/fixtures", { recursive: true });
sharp(Buffer.from(svg))
  .png()
  .toFile("test/fixtures/khmer-math-test.png")
  .then((info) => {
    console.log("Successfully generated test/fixtures/khmer-math-test.png:", info);
  })
  .catch((err) => {
    console.error("Failed to generate fixture:", err);
  });
