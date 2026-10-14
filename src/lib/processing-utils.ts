import { AppError } from "./types";

/**
 * Registry to track and cleanly revoke Object URLs to prevent browser memory leaks.
 */
export class ObjectUrlRegistry {
  private urls = new Set<string>();

  public create(blob: Blob | MediaSource): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  public revoke(url: string | null | undefined): void {
    if (!url) return;
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  public revokeAll(): void {
    for (const url of this.urls) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();
  }
}

/**
 * Creates an AbortSignal that aborts after timeoutMs or when parentSignal aborts.
 */
export function createTimeoutSignal(
  timeoutMs: number,
  parentSignal?: AbortSignal | null
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | null = null;

  const onParentAbort = () => {
    if (timer) clearTimeout(timer);
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
      return { signal: controller.signal, cleanup: () => {} };
    }
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  timer = setTimeout(() => {
    controller.abort(new Error(`Operation timed out after ${timeoutMs / 1000} seconds.`));
  }, timeoutMs);

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Validates uploaded image file against size, format, and structure.
 */
export function validateImageFile(
  file: File | Blob,
  options?: {
    maxSizeBytes?: number;
    allowedTypes?: string[];
  }
): { valid: boolean; error?: AppError } {
  const maxBytes = options?.maxSizeBytes ?? 15 * 1024 * 1024; // 15MB default
  const allowed = options?.allowedTypes ?? [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (file.size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `File size ${(file.size / (1024 * 1024)).toFixed(1)} MB exceeds maximum limit of ${mb} MB.`,
        userMessage: `Image exceeds ${mb} MB limit. Please choose a smaller image.`,
        retryable: false,
      },
    };
  }

  if (file.type && !allowed.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `Unsupported file format '${file.type}'. Allowed: ${allowed.join(", ")}`,
        userMessage: "Unsupported format. Please upload PNG, JPG, or WEBP.",
        retryable: false,
      },
    };
  }

  return { valid: true };
}

/**
 * Retrieves natural width and height of an image blob.
 */
export async function getImageDimensions(
  blob: Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image dimensions."));
    };
    img.src = url;
  });
}

/**
 * Scales an image down if either dimension exceeds maxDim, to protect browser memory.
 */
export async function downscaleImageIfExceeds(
  imageSource: Blob | File,
  maxDim = 1200
): Promise<{ blob: Blob; width: number; height: number; wasScaled: boolean }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(imageSource);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      if (w <= maxDim && h <= maxDim) {
        resolve({ blob: imageSource, width: w, height: h, wasScaled: false });
        return;
      }

      const scale = Math.min(maxDim / w, maxDim / h);
      const targetW = Math.round(w * scale);
      const targetH = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        resolve({ blob: imageSource, width: w, height: h, wasScaled: false });
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width: targetW, height: targetH, wasScaled: true });
          } else {
            resolve({ blob: imageSource, width: w, height: h, wasScaled: false });
          }
        },
        "image/png",
        0.95
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image for scaling."));
    };

    img.src = objectUrl;
  });
}

/**
 * Helper to execute fetch with exponential backoff retry on 503/504/429
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 2000
): Promise<Response> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);

      // Status 503 (model warming up), 504 (timeout), 429 (rate limited)
      if ((res.status === 503 || res.status === 504 || res.status === 429) && attempt < maxRetries - 1) {
        attempt++;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 1.5;
        continue;
      }

      return res;
    } catch (err) {
      if (options.signal?.aborted) throw err;
      attempt++;
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 1.5;
    }
  }

  throw new Error(`Failed to complete request to ${url} after ${maxRetries} attempts.`);
}
