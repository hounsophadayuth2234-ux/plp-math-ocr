/**
 * Server-Side Background Removal & High-Precision Canvas Compositor
 * Powered by Hugging Face Inference API ("briaai/RMBG-1.4") via /api/remove-bg.
 * Prevents browser crashing, runs with zero client-side memory bloat,
 * and composites solid White (#FFFFFF) or Pale Pink (#FFF0F5) onto HTML5 Canvas.
 */

/**
 * Sends image to the backend Next.js API route (/api/remove-bg),
 * which securely contacts Hugging Face RMBG-1.4 and streams back
 * the transparent PNG cutout blob.
 */
export async function requestServerBackgroundRemoval(imageFile: File | Blob): Promise<Blob> {
  const formData = new FormData();
  formData.append("image", imageFile);

  const res = await fetch("/api/remove-bg", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(
      errorData?.error || `Cloud Core returned status ${res.status} during segmentation.`
    );
  }

  // Receive the transparent PNG cutout blob from the server
  return await res.blob();
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
