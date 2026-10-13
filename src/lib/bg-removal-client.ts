/**
 * Replicate Background Removal & High-Precision Canvas Compositor
 * Powered by Replicate API (BiRefNet - Bilateral Reference Image Segmentation)
 * 
 * Pipeline:
 * 1. Uploads image to /api/remove-bg (proxies to Replicate BiRefNet).
 * 2. Receives transparent cutout PNG binary blob.
 * 3. Draws transparent cutout onto HTML5 Canvas.
 * 4. Fills solid background with White (#FFFFFF) or Pale Pink (#FFF0F5).
 * 5. Provides baked composite image for 1-click download.
 */

/**
 * Helper to ensure extremely massive images (> 2500px) don't exceed
 * Vercel's serverless 4.5MB body payload limit.
 */
async function ensureSafePayloadImage(imageFile: File | Blob, maxDim = 2048): Promise<Blob> {
  return new Promise((resolve) => {
    // If size is under 3MB, no need to resize at all
    if (imageFile.size < 3 * 1024 * 1024) {
      resolve(imageFile);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      if (w <= maxDim && h <= maxDim) {
        resolve(imageFile);
        return;
      }

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
      }, "image/png", 0.95);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(imageFile);
    };

    img.src = objectUrl;
  });
}

/**
 * Sends image to the backend Next.js API route (/api/remove-bg),
 * which securely invokes Replicate BiRefNet and streams back
 * the transparent PNG cutout blob.
 */
export async function requestReplicateBackgroundRemoval(
  imageFile: File | Blob
): Promise<{ blob: Blob; provider: string }> {
  // Pre-guard against payload size limits
  const safeImage = await ensureSafePayloadImage(imageFile, 2048);

  const formData = new FormData();
  formData.append("image", safeImage);

  const res = await fetch("/api/remove-bg", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(
      errorData?.error || `Replicate Core returned status ${res.status} during segmentation.`
    );
  }

  const modelHeader = res.headers.get("X-Segmentation-Model") || "Replicate BiRefNet";
  const blob = await res.blob();

  return {
    blob,
    provider: modelHeader,
  };
}

/**
 * Composites the transparent cutout blob onto an HTML5 Canvas:
 * 1. Sets canvas to full natural dimensions.
 * 2. Fills solid background with either #FFFFFF (Question) or #FFF0F5 (Solution).
 * 3. Draws the transparent cutout subject on top.
 * 4. Exports high-resolution composite dataUrl and Blob for direct download.
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
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;

        const canvas = document.createElement("canvas");
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

        // 2. Draw the transparent cutout subject on top
        ctx.drawImage(img, 0, 0, w, h);

        // 3. Export high-resolution PNG with solid color baked into the pixels
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
      reject(new Error("Failed to load transparent cutout for canvas compositing."));
    };

    img.src = objectUrl;
  });
}
