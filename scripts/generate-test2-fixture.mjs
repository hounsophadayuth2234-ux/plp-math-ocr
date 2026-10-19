import sharp from "sharp";
import fs from "fs";

const svg = `
<svg width="700" height="350" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff" />
  <text x="60" y="80" font-family="'Kantumruy Pro', 'Khmer OS Battambang', 'Hanuman', sans-serif" font-size="28" font-weight="bold" fill="#0f172a">ចូរគណនា៖ ២ + ៣ = ?</text>
  <text x="60" y="160" font-family="'Kantumruy Pro', 'Times New Roman', serif" font-size="32" font-weight="bold" fill="#0f172a">សមីការ៖ x² + 5x + 6 = 0</text>
  <text x="60" y="240" font-family="'Times New Roman', serif" font-size="36" font-weight="bold" fill="#1e293b">2 + 3 = 5</text>
</svg>
`;

fs.mkdirSync("test/fixtures", { recursive: true });
sharp(Buffer.from(svg))
  .png()
  .toFile("test/fixtures/khmer-test2-multiline.png")
  .then((info) => {
    console.log("Successfully generated test/fixtures/khmer-test2-multiline.png:", info);
  })
  .catch((err) => {
    console.error("Failed to generate test 2 fixture:", err);
  });
