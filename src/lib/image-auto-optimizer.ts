/**
 * Client-Side Large Image Auto-Optimizer & Stress Guardrail
 *
 * Automatically downscales and compresses heavy images (e.g., 5MB–20MB high-res phone photos)
 * on the client side before inference or network transfer.
 *
 * Features:
 * - Proportional downscaling with max dimension ceiling (default 2048px).
 * - High-quality image smoothing (bicubic / high quality canvas).
 * - Size optimization to keep payloads well under browser and API limits.
 * - Safe fallback in non-browser (Node.js/SSR) test environments.
 */

export interface AutoOptimizationResult {
  file: File;
  wasOptimized: boolean;
  originalSizeMB: number;
  newSizeMB: number;
  originalWidth: number;
  originalHeight: number;
  newWidth: number;
  newHeight: number;
}

export interface AutoOptimizationOptions {
  maxDimension?: number; // e.g. 2048px
  sizeThresholdBytes?: number; // e.g. 4.5 MB
  quality?: number; // e.g. 0.88
}

export const AUTO_OPTIMIZE_MESSAGE_KHMER =
  "បានបង្រួមទំហំរូបភាពធំដោយស្វ័យប្រវត្តិដើម្បីឱ្យដំណើរការលឿន និងមិនគាំង (Large image auto-optimized for smooth processing)";

export async function optimizeLargeImageIfNeeded(
  file: File,
  options: AutoOptimizationOptions = {}
): Promise<AutoOptimizationResult> {
  const maxDimension = options.maxDimension ?? 2048;
  const sizeThreshold = options.sizeThresholdBytes ?? 4.5 * 1024 * 1024; // 4.5 MB
  const quality = options.quality ?? 0.88;

  const originalSizeMB = Number((file.size / (1024 * 1024)).toFixed(2));

  // If running in SSR or Node test environment without full canvas
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      file,
      wasOptimized: false,
      originalSizeMB,
      newSizeMB: originalSizeMB,
      originalWidth: 0,
      originalHeight: 0,
      newWidth: 0,
      newHeight: 0,
    };
  }

  try {
    let origW = 0;
    let origH = 0;
    let imageSource: ImageBitmap | HTMLImageElement | null = null;

    if (typeof createImageBitmap === "function") {
      try {
        const bmp = await createImageBitmap(file);
        origW = bmp.width;
        origH = bmp.height;
        imageSource = bmp;
      } catch {
        // Fallback to Image element below
      }
    }

    if (!imageSource) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          origW = img.naturalWidth || img.width;
          origH = img.naturalHeight || img.height;
          resolve();
        };
        img.onerror = () => reject(new Error("Image decode failed"));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      imageSource = img;
    }

    // Determine if resize or compression is required:
    // 1. File size exceeds threshold (>= 4.5 MB)
    // 2. Either width or height exceeds maxDimension (e.g. > 2048px)
    const isHeavyFile = file.size > sizeThreshold;
    const isExceedingDimension = origW > maxDimension || origH > maxDimension;

    if (!isHeavyFile && !isExceedingDimension) {
      if ("close" in imageSource && typeof imageSource.close === "function") {
        imageSource.close();
      }
      return {
        file,
        wasOptimized: false,
        originalSizeMB,
        newSizeMB: originalSizeMB,
        originalWidth: origW,
        originalHeight: origH,
        newWidth: origW,
        newHeight: origH,
      };
    }

    // Calculate proportional dimensions
    let targetW = origW;
    let targetH = origH;

    if (isExceedingDimension) {
      if (origW >= origH) {
        targetW = maxDimension;
        targetH = Math.max(1, Math.round((origH * maxDimension) / origW));
      } else {
        targetH = maxDimension;
        targetW = Math.max(1, Math.round((origW * maxDimension) / origH));
      }
    }

    // Draw to canvas with high-quality smoothing
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      if ("close" in imageSource && typeof imageSource.close === "function") {
        imageSource.close();
      }
      return {
        file,
        wasOptimized: false,
        originalSizeMB,
        newSizeMB: originalSizeMB,
        originalWidth: origW,
        originalHeight: origH,
        newWidth: origW,
        newHeight: origH,
      };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (imageSource instanceof ImageBitmap) {
      ctx.drawImage(imageSource, 0, 0, targetW, targetH);
      imageSource.close();
    } else {
      ctx.drawImage(imageSource, 0, 0, targetW, targetH);
    }

    // Format selection: preserve PNG if transparent/png, otherwise JPEG/WebP
    const isPng = file.type === "image/png";
    // For large photos, JPEG/WebP gives 5x-10x compression over PNG
    const outputFormat = isPng && !isHeavyFile ? "image/png" : "image/jpeg";

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), outputFormat, quality);
    });

    if (!blob || (blob.size >= file.size && !isExceedingDimension)) {
      // If compressed blob is somehow larger and dimensions weren't exceeded, keep original
      return {
        file,
        wasOptimized: false,
        originalSizeMB,
        newSizeMB: originalSizeMB,
        originalWidth: origW,
        originalHeight: origH,
        newWidth: origW,
        newHeight: origH,
      };
    }

    // Construct new File with safe filename
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const ext = outputFormat === "image/png" ? ".png" : ".jpg";
    const optimizedFile = new File([blob], `${baseName}-opt${ext}`, {
      type: outputFormat,
      lastModified: Date.now(),
    });

    const newSizeMB = Number((optimizedFile.size / (1024 * 1024)).toFixed(2));

    return {
      file: optimizedFile,
      wasOptimized: true,
      originalSizeMB,
      newSizeMB,
      originalWidth: origW,
      originalHeight: origH,
      newWidth: targetW,
      newHeight: targetH,
    };
  } catch (err) {
    console.warn("Client-side auto-optimization failed, falling back to original:", err);
    return {
      file,
      wasOptimized: false,
      originalSizeMB,
      newSizeMB: originalSizeMB,
      originalWidth: 0,
      originalHeight: 0,
      newWidth: 0,
      newHeight: 0,
    };
  }
}
