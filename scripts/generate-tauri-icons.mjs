import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const srcLogo = path.join(rootDir, "public", "brand", "plp-math-content-logo.jpg");
const iconsDir = path.join(rootDir, "src-tauri", "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

async function generateIcons() {
  console.log("Generating Tauri icons with RGBA alpha channels from:", srcLogo);
  
  // 512x512 main icon
  await sharp(srcLogo)
    .resize(512, 512, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toFile(path.join(iconsDir, "icon.png"));

  // 128x128@2x (256x256)
  await sharp(srcLogo)
    .resize(256, 256, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toFile(path.join(iconsDir, "128x128@2x.png"));

  // 128x128
  await sharp(srcLogo)
    .resize(128, 128, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toFile(path.join(iconsDir, "128x128.png"));

  // 32x32
  await sharp(srcLogo)
    .resize(32, 32, { fit: "cover" })
    .ensureAlpha()
    .png()
    .toFile(path.join(iconsDir, "32x32.png"));

  // Minimal valid 32x32 ICO header + PNG payload
  const png32 = await sharp(srcLogo).resize(32, 32, { fit: "cover" }).ensureAlpha().png().toBuffer();
  // Standard ICO header: 6 bytes header + 16 bytes directory entry + png data
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // reserved
  icoHeader.writeUInt16LE(1, 2); // type 1 = icon
  icoHeader.writeUInt16LE(1, 4); // 1 image
  icoHeader.writeUInt8(32, 6);  // width
  icoHeader.writeUInt8(32, 7);  // height
  icoHeader.writeUInt8(0, 8);   // color palette
  icoHeader.writeUInt8(0, 9);   // reserved
  icoHeader.writeUInt16LE(1, 10); // color planes
  icoHeader.writeUInt16LE(32, 12); // bits per pixel
  icoHeader.writeUInt32LE(png32.length, 14); // image size
  icoHeader.writeUInt32LE(22, 18); // image offset
  fs.writeFileSync(path.join(iconsDir, "icon.ico"), Buffer.concat([icoHeader, png32]));

  // Valid 128x128 ICNS header + PNG chunk
  const png128 = await sharp(srcLogo).resize(128, 128, { fit: "cover" }).ensureAlpha().png().toBuffer();
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write("icns", 0);
  icnsHeader.writeUInt32BE(8 + 8 + png128.length, 4);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write("ic07", 0); // 128x128 PNG icon type
  chunkHeader.writeUInt32BE(8 + png128.length, 4);
  fs.writeFileSync(path.join(iconsDir, "icon.icns"), Buffer.concat([icnsHeader, chunkHeader, png128]));

  console.log("All Tauri RGBA icons successfully regenerated!");
}

generateIcons().catch(err => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
