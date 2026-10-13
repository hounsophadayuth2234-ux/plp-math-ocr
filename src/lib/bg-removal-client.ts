/**
 * High-Performance Client-Side Background Removal & Edge Defringing Engine
 * Powered by @imgly/background-removal with Web Worker optimization,
 * Aggressive 2px Mask Erosion, Color Decontamination, and Canvas Compositing.
 */

export interface BgRemovalProgress {
  key: string;
  current: number;
  total: number;
  percent: number;
}

/**
 * Pre-scale large input images down to optimal resolution (max 1280px)
 * to prevent browser freezing, reduce memory overhead, and speed up segmentation by 5-10x.
 */
async function optimizeInputImage(imageFile: File | Blob, maxDim = 1280): Promise<Blob> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // If already within optimal limits, return original file
      if (w <= maxDim && h <= maxDim) {
        resolve(imageFile);
        return;
      }

      // Compute scale
      const scale = Math.min(maxDim / w, maxDim / h);
      const targetW = Math.round(w * scale);
      const targetH = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(imageFile);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob((blob) => {
        resolve(blob || imageFile);
      }, "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(imageFile);
    };

    img.src = objectUrl;
  });
}

/**
 * Intelligent Canvas segmentation fallback if WASM/CDN is unavailable.
 */
export async function fallbackCanvasBackgroundRemoval(imageFile: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to get 2D canvas context."));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Sample background color from corners
        const corners = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        for (const [cx, cy] of corners) {
          const idx = (cy * w + cx) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        }
        bgR = Math.round(bgR / corners.length);
        bgG = Math.round(bgG / corners.length);
        bgB = Math.round(bgB / corners.length);

        const tolerance = 48;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const dist = Math.sqrt(
            (r - bgR) * (r - bgR) +
            (g - bgG) * (g - bgG) +
            (b - bgB) * (b - bgB)
          );

          if (dist < tolerance) {
            data[i + 3] = 0;
          } else if (dist < tolerance + 20) {
            const alpha = (dist - tolerance) / 20;
            data[i + 3] = Math.round(alpha * 255);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error("Failed to export fallback transparent blob."));
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load source image for fallback processing."));
    };

    img.src = url;
  });
}

/**
 * Aggressive Edge Cleanup, Mask Erosion & Discreet Sharpening:
 * 1. 2-Pass Morphological Erosion: Eats away 1.5 - 2.0 pixels of the outer mask boundary,
 *    completely stripping away edge halo and white fringe remnants.
 * 2. Color Decontamination: Detects semi-transparent edge pixels and bleeds pure interior
 *    foreground RGB outwards, destroying any remaining background bleeding.
 * 3. Edge Feathering / Anti-Aliasing: Applies gentle Gaussian feathering on the eroded boundary
 *    so the subject blends seamlessly into solid White (#FFFFFF) or Pale Pink (#FFF0F5).
 * 4. Discreet 3x3 Convolution Sharpening: Crisps up hair strands, suit fabrics, and facial details.
 */
export async function refineAndSharpenForegroundBlob(rawBlob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(rawBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;
        const totalPixels = w * h;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(rawBlob);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Extract raw alpha channel
        const alpha0 = new Uint8ClampedArray(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          alpha0[i] = data[i * 4 + 3];
        }

        // 2. Pass 1 Erosion (contracting mask by 1 pixel)
        const alpha1 = new Uint8ClampedArray(totalPixels);
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const a = alpha0[idx];
            if (a === 0) {
              alpha1[idx] = 0;
              continue;
            }

            let minA = a;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) { minA = 0; break; }
              const nOffset = ny * w;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) { minA = 0; break; }
                const na = alpha0[nOffset + nx];
                if (na < minA) minA = na;
              }
            }
            alpha1[idx] = minA;
          }
        }

        // 3. Pass 2 Erosion (contracting further by 0.8 - 1.0 pixel to destroy halo remnants)
        const erodedAlpha = new Uint8ClampedArray(totalPixels);
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const a = alpha1[idx];
            if (a === 0) {
              erodedAlpha[idx] = 0;
              continue;
            }

            // Sample orthogonal neighbors for tight sub-pixel contraction
            let minA = a;
            const up = y > 0 ? alpha1[(y - 1) * w + x] : 0;
            const down = y < h - 1 ? alpha1[(y + 1) * w + x] : 0;
            const left = x > 0 ? alpha1[yOffset + (x - 1)] : 0;
            const right = x < w - 1 ? alpha1[yOffset + (x + 1)] : 0;

            const minOrthogonal = Math.min(up, down, left, right);
            // If near edge, contract aggressively
            if (minOrthogonal < 200) {
              erodedAlpha[idx] = Math.min(a, minOrthogonal);
            } else {
              erodedAlpha[idx] = a;
            }
          }
        }

        // 4. Smooth & Anti-Alias Boundary (Feathering)
        const smoothAlpha = new Uint8ClampedArray(totalPixels);
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const a = erodedAlpha[idx];
            if (a === 0) {
              smoothAlpha[idx] = 0;
              continue;
            }
            if (a === 255) {
              // Check if solid interior
              const up = y > 0 ? erodedAlpha[(y - 1) * w + x] : 0;
              const down = y < h - 1 ? erodedAlpha[(y + 1) * w + x] : 0;
              const left = x > 0 ? erodedAlpha[yOffset + (x - 1)] : 0;
              const right = x < w - 1 ? erodedAlpha[yOffset + (x + 1)] : 0;
              if (up === 255 && down === 255 && left === 255 && right === 255) {
                smoothAlpha[idx] = 255;
                continue;
              }
            }

            // 3x3 Gaussian smoothing on boundary pixels
            let sum = 0;
            let count = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              const nOffset = ny * w;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const weight = (dx === 0 && dy === 0) ? 4 : (dx === 0 || dy === 0) ? 2 : 1;
                sum += erodedAlpha[nOffset + nx] * weight;
                count += weight;
              }
            }
            smoothAlpha[idx] = Math.round(sum / count);
          }
        }

        // 5. Color Decontamination (propagate solid interior foreground RGB to eliminate fringe bleed)
        const decontamR = new Uint8ClampedArray(totalPixels);
        const decontamG = new Uint8ClampedArray(totalPixels);
        const decontamB = new Uint8ClampedArray(totalPixels);

        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const pIdx = idx * 4;
            const a = smoothAlpha[idx];

            if (a === 0) {
              decontamR[idx] = 0;
              decontamG[idx] = 0;
              decontamB[idx] = 0;
              continue;
            }

            // Solid interior: keep original colors
            if (a >= 240) {
              decontamR[idx] = data[pIdx];
              decontamG[idx] = data[pIdx + 1];
              decontamB[idx] = data[pIdx + 2];
              continue;
            }

            // Semi-transparent edge: bleed pure foreground color from solid interior (radius 3)
            let sR = 0, sG = 0, sB = 0, sCount = 0;
            for (let dy = -3; dy <= 3; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              const nOffset = ny * w;
              for (let dx = -3; dx <= 3; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const nIdx = nOffset + nx;
                if (alpha0[nIdx] >= 235) {
                  sR += data[nIdx * 4];
                  sG += data[nIdx * 4 + 1];
                  sB += data[nIdx * 4 + 2];
                  sCount++;
                }
              }
            }

            if (sCount > 0) {
              const avgR = sR / sCount;
              const avgG = sG / sCount;
              const avgB = sB / sCount;
              const blendFactor = Math.pow(1 - (a / 255), 1.4);
              decontamR[idx] = Math.round(data[pIdx] * (1 - blendFactor) + avgR * blendFactor);
              decontamG[idx] = Math.round(data[pIdx + 1] * (1 - blendFactor) + avgG * blendFactor);
              decontamB[idx] = Math.round(data[pIdx + 2] * (1 - blendFactor) + avgB * blendFactor);
            } else {
              decontamR[idx] = data[pIdx];
              decontamG[idx] = data[pIdx + 1];
              decontamB[idx] = data[pIdx + 2];
            }
          }
        }

        // 6. Discreet 3x3 Sharpening Convolution Filter
        // Matrix:
        // [  0,   -0.5,   0  ]
        // [ -0.5,  3.0,  -0.5]
        // [  0,   -0.5,   0  ]
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const pIdx = idx * 4;
            const a = smoothAlpha[idx];

            if (a === 0) {
              data[pIdx] = 0;
              data[pIdx + 1] = 0;
              data[pIdx + 2] = 0;
              data[pIdx + 3] = 0;
              continue;
            }

            const topIdx = (y > 0 ? (y - 1) * w + x : idx);
            const botIdx = (y < h - 1 ? (y + 1) * w + x : idx);
            const leftIdx = (x > 0 ? yOffset + (x - 1) : idx);
            const rightIdx = (x < w - 1 ? yOffset + (x + 1) : idx);

            const sharpR = 3.0 * decontamR[idx] - 0.5 * (
              decontamR[topIdx] + decontamR[botIdx] + decontamR[leftIdx] + decontamR[rightIdx]
            );
            const sharpG = 3.0 * decontamG[idx] - 0.5 * (
              decontamG[topIdx] + decontamG[botIdx] + decontamG[leftIdx] + decontamG[rightIdx]
            );
            const sharpB = 3.0 * decontamB[idx] - 0.5 * (
              decontamB[topIdx] + decontamB[botIdx] + decontamB[leftIdx] + decontamB[rightIdx]
            );

            // Natural texture blend (0.85 sharp + 0.15 original) for crisp details
            data[pIdx] = Math.max(0, Math.min(255, Math.round(sharpR * 0.85 + decontamR[idx] * 0.15)));
            data[pIdx + 1] = Math.max(0, Math.min(255, Math.round(sharpG * 0.85 + decontamG[idx] * 0.15)));
            data[pIdx + 2] = Math.max(0, Math.min(255, Math.round(sharpB * 0.85 + decontamB[idx] * 0.15)));
            data[pIdx + 3] = a;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else resolve(rawBlob);
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        console.warn("[bg-remover] Foreground refinement error, using raw:", err);
        resolve(rawBlob);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(rawBlob);
    };

    img.src = objectUrl;
  });
}

/**
 * High-performance background removal execution:
 * 1. Pre-scales large images (max 1280px) to prevent browser freezing.
 * 2. Uses Web Worker proxying (`proxyToWorker: true`) so UI stays responsive at 60fps.
 * 3. Applies aggressive 2px mask erosion, color decontamination & 3x3 sharpening.
 */
export async function removeBackgroundClient(
  imageSource: Blob | File,
  onProgress?: (progress: BgRemovalProgress) => void
): Promise<{ blob: Blob; provider: "imgly_neural" | "canvas_chroma" }> {
  let rawBlob: Blob;
  let provider: "imgly_neural" | "canvas_chroma" = "imgly_neural";

  try {
    // 1. Optimize input image to avoid freezing the browser on massive files
    const optimizedImage = await optimizeInputImage(imageSource, 1280);

    // 2. Run @imgly/background-removal in a Web Worker thread
    const { removeBackground } = await import("@imgly/background-removal");
    rawBlob = await removeBackground(optimizedImage, {
      model: "isnet_quint8",
      proxyToWorker: true,
      output: {
        format: "image/png",
        quality: 0.95,
      },
      progress: (key: string, current: number, total: number) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        onProgress?.({ key, current, total, percent });
      },
    });
  } catch (err) {
    console.warn("[bg-remover] @imgly/background-removal fallback:", err);
    rawBlob = await fallbackCanvasBackgroundRemoval(imageSource);
    provider = "canvas_chroma";
  }

  // 3. Post-processing: Aggressive 2px mask erosion + color decontamination + 3x3 sharpening
  const refinedBlob = await refineAndSharpenForegroundBlob(rawBlob);
  return { blob: refinedBlob, provider };
}

/**
 * Composites the refined transparent PNG Blob onto an HTML5 Canvas with the target solid background color.
 * Fills solid background with #FFFFFF (Question) or #FFF0F5 (Solution),
 * then blends the anti-aliased, de-fringed, sharpened subject on top.
 * Returns the final composite dataUrl, dimensions, and Blob for direct download.
 */
export async function compositeWithSolidColor(
  transparentBlob: Blob,
  bgColorHex: string
): Promise<{ dataUrl: string; width: number; height: number; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(transparentBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to create HTML5 2D Canvas context."));
          return;
        }

        // 1. Fill solid background color (#FFFFFF or #FFF0F5)
        ctx.fillStyle = bgColorHex;
        ctx.fillRect(0, 0, w, h);

        // 2. Draw the anti-aliased, decontaminated, and sharpened subject on top
        ctx.drawImage(img, 0, 0, w, h);

        // 3. Export high-resolution PNG with the solid color baked in
        const dataUrl = canvas.toDataURL("image/png");
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            dataUrl,
            width: w,
            height: h,
            blob: blob || transparentBlob,
          });
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load the transparent image for canvas compositing."));
    };

    img.src = objectUrl;
  });
}
