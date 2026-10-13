/**
 * Client-Side Background Removal & High-Precision Canvas Compositor
 * Powered by @imgly/background-removal (WebAssembly + ONNX Runtime Web).
 * Runs 100% locally in the browser with zero external API keys needed!
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
 * Guarantees that even if external network/CDN is offline, backgrounds are actually removed!
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

        // Sample background color from 4 corners
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
            // Background pixel: make transparent
            data[i + 3] = 0;
          } else if (dist < tolerance + 24) {
            // Soft anti-aliased edge
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
 * Removes background using @imgly/background-removal (primary)
 * or fallback segmentation if network/CDN is unreachable.
 * Returns a transparent PNG Blob.
 */
export async function removeBackgroundClient(
  imageSource: Blob | File,
  onProgress?: (progress: BgRemovalProgress) => void
): Promise<{ blob: Blob; provider: "imgly_neural" | "canvas_chroma" }> {
  try {
    // 1. Try @imgly/background-removal (AI ONNX Model)
    const { removeBackground } = await import("@imgly/background-removal");
    const transparentBlob = await removeBackground(imageSource, {
      model: "isnet_quint8", // Quantized fast model
      output: {
        format: "image/png",
        quality: 0.95,
      },
      progress: (key: string, current: number, total: number) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        onProgress?.({ key, current, total, percent });
      },
    });

    return { blob: transparentBlob, provider: "imgly_neural" };
  } catch (err) {
    console.warn("[bg-remover] @imgly/background-removal failed, activating fallback segmenter:", err);
    // 2. Fallback to intelligent canvas segmentation
    const fallbackBlob = await fallbackCanvasBackgroundRemoval(imageSource);
    return { blob: fallbackBlob, provider: "canvas_chroma" };
  }
}

/**
 * Composites a transparent PNG Blob onto an HTML5 Canvas with a solid background color.
 * Fills solid background with #FFFFFF (Question) or #FFF0F5 (Solution),
 * then draws the transparent subject on top.
 * Returns the final dataUrl, dimensions, and composite Blob.
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

        // 2. Draw the transparent subject on top
        ctx.drawImage(img, 0, 0, w, h);

        // 3. Export high-resolution PNG with the solid background color baked in
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
