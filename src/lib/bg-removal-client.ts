/**
 * Client-Side Background Removal, Edge Defringing & Clarity Enhancement Pipeline
 * Powered by @imgly/background-removal + HTML5 Canvas Neural Post-Processing.
 * Runs 100% locally in the browser with zero external API keys needed.
 */

export interface BgRemovalProgress {
  key: string;
  current: number;
  total: number;
  percent: number;
}

/**
 * Intelligent Canvas segmentation fallback.
 * Detects the background color from image corners/borders and makes it transparent.
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

        // Sample background color from image boundaries
        const corners = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
          [Math.floor(w / 2), 0],
          [0, Math.floor(h / 2)],
        ];

        let bgR = 0;
        let bgG = 0;
        let bgB = 0;
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
          } else if (dist < tolerance + 24) {
            const alpha = (dist - tolerance) / 24;
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
 * Advanced Edge Refinement & Discreet Quality Enhancement:
 * 1. Mask Erosion (1-1.5px) to eat away edge halo/fringe remnants.
 * 2. Smoothing and anti-aliasing on mask boundary to eliminate jagged cutout pixels.
 * 3. Color decontamination on boundary pixels to strip out background bleeding.
 * 4. Discreet 3x3 sharpening convolution matrix:
 *    [  0,   -0.5,   0  ]
 *    [ -0.5,  3.0,  -0.5]
 *    [  0,   -0.5,   0  ]
 *    Enhances fine details, hair, suit texture and clarity.
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

        // 1. Extract Alpha Channel
        const origAlpha = new Uint8ClampedArray(w * h);
        for (let i = 0; i < w * h; i++) {
          origAlpha[i] = data[i * 4 + 3];
        }

        // 2. Mask Erosion (contracting mask boundary by 1 to 1.5 pixels)
        const erodedAlpha = new Uint8ClampedArray(w * h);
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const a = origAlpha[idx];
            if (a === 0) {
              erodedAlpha[idx] = 0;
              continue;
            }

            let minA = a;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) {
                minA = 0;
                break;
              }
              const nOffset = ny * w;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) {
                  minA = 0;
                  break;
                }
                const na = origAlpha[nOffset + nx];
                if (na < minA) minA = na;
              }
            }
            erodedAlpha[idx] = minA;
          }
        }

        // 3. Edge Smoothing & Anti-Aliasing (Gentle feathering on transition zone)
        const smoothAlpha = new Uint8ClampedArray(w * h);
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
              let isSolidInterior = true;
              for (let dy = -1; dy <= 1 && isSolidInterior; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) {
                  isSolidInterior = false;
                  break;
                }
                const nOffset = ny * w;
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = x + dx;
                  if (nx < 0 || nx >= w || erodedAlpha[nOffset + nx] < 255) {
                    isSolidInterior = false;
                    break;
                  }
                }
              }
              if (isSolidInterior) {
                smoothAlpha[idx] = 255;
                continue;
              }
            }

            // Weighted 3x3 smoothing
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

        // 4. Color Decontamination on boundary pixels (strip out background bleeding)
        const decontamR = new Uint8ClampedArray(w * h);
        const decontamG = new Uint8ClampedArray(w * h);
        const decontamB = new Uint8ClampedArray(w * h);

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

            if (a >= 250) {
              decontamR[idx] = data[pIdx];
              decontamG[idx] = data[pIdx + 1];
              decontamB[idx] = data[pIdx + 2];
              continue;
            }

            // Search nearby solid pixels (radius 2) to propagate true foreground color
            let sR = 0, sG = 0, sB = 0, sCount = 0;
            for (let dy = -2; dy <= 2; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              const nOffset = ny * w;
              for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const nIdx = nOffset + nx;
                if (origAlpha[nIdx] >= 235) {
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
              const blendFactor = Math.pow(1 - (a / 255), 1.2);
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

        // 5. Discreet 3x3 Sharpening Convolution Filter
        // Kernel:
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

            // Natural detail blend (0.85 sharp + 0.15 original) for crisp hair & clothing
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
 * Removes background using @imgly/background-removal (primary)
 * or fallback segmentation, then automatically applies mask erosion,
 * edge anti-aliasing, color decontamination, and subtle 3x3 sharpening.
 * Returns the polished, high-definition transparent PNG Blob.
 */
export async function removeBackgroundClient(
  imageSource: Blob | File,
  onProgress?: (progress: BgRemovalProgress) => void
): Promise<{ blob: Blob; provider: "imgly_neural" | "canvas_chroma" }> {
  let rawBlob: Blob;
  let provider: "imgly_neural" | "canvas_chroma" = "imgly_neural";

  try {
    const { removeBackground } = await import("@imgly/background-removal");
    rawBlob = await removeBackground(imageSource, {
      model: "isnet_quint8",
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

  // Silently apply edge defringing + 3x3 sharpening in the background
  const refinedBlob = await refineAndSharpenForegroundBlob(rawBlob);
  return { blob: refinedBlob, provider };
}

/**
 * Composites the refined transparent PNG Blob onto an HTML5 Canvas with the target solid background color.
 * Fills solid background with #FFFFFF (Question) or #FFF0F5 (Solution),
 * then blends the anti-aliased, sharpened subject on top.
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

        // 3. Export high-resolution PNG with the solid color and enhancements baked in
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
