import { pipeline, RawImage } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';

async function testBiRefNet() {
  const model_id = 'onnx-community/BiRefNet_lite-ONNX';
  console.log(`Loading pipeline('image-segmentation', '${model_id}')...`);
  const t0 = Date.now();
  
  const pipe = await pipeline('image-segmentation', model_id, {
    progress_callback: (info) => {
      if (info.status === 'progress') {
        console.log(`Download [${info.file}]: ${Math.round(info.progress || 0)}%`);
      }
    }
  });
  console.log(`Pipeline loaded in ${Date.now() - t0} ms`);

  const imgPath = path.resolve('portrait-pink.png');
  const buffer = fs.readFileSync(imgPath);
  const blob = new Blob([buffer], { type: 'image/png' });
  const image = await RawImage.fromBlob(blob);

  console.log(`Image size: ${image.width}x${image.height}`);
  const t1 = Date.now();
  const output = await pipe(image);
  console.log(`Inference took ${Date.now() - t1} ms`);
  const mask = output[0].mask;
  console.log(`Mask size: ${mask.width}x${mask.height}, channels: ${mask.channels}`);

  // Composite transparent PNG
  const rgbaData = new Uint8ClampedArray(image.width * image.height * 4);
  const rawRgba = await image.rgba();
  const maskData = mask.data;

  for (let i = 0; i < image.width * image.height; i++) {
    rgbaData[i * 4] = rawRgba.data[i * 4];
    rgbaData[i * 4 + 1] = rawRgba.data[i * 4 + 1];
    rgbaData[i * 4 + 2] = rawRgba.data[i * 4 + 2];
    rgbaData[i * 4 + 3] = maskData[i]; // alpha from BiRefNet
  }

  const outputRaw = new RawImage(rgbaData, image.width, image.height, 4);
  await outputRaw.save('test-birefnet-cutout.png');
  console.log("Saved test-birefnet-cutout.png!");
}

testBiRefNet().catch(e => {
  console.error("BiRefNet error:", e);
});

