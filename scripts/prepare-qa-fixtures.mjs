import fs from 'fs';
import path from 'path';

const outDir = path.resolve('test-fixtures');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 1. Create a 0-byte file
fs.writeFileSync(path.join(outDir, 'fixture-0byte.png'), Buffer.alloc(0));

// 2. Create a corrupt/undecodable image file
fs.writeFileSync(path.join(outDir, 'fixture-corrupt.jpg'), Buffer.from('NOT_A_REAL_JPEG_IMAGE_HEADER_1234567890'));

// 3. Create an unsupported file
fs.writeFileSync(path.join(outDir, 'fixture-unsupported.txt'), Buffer.from('This is a text document, not an image.'));

// 4. Create an oversized 13MB file
const over12Mb = Buffer.alloc(13 * 1024 * 1024, 0x42);
// Give it a PNG header so mime type is image/png
const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
pngSig.copy(over12Mb, 0);
fs.writeFileSync(path.join(outDir, 'fixture-oversized.png'), over12Mb);

console.log('Static test fixtures created in test-fixtures/');
