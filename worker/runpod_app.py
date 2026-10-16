"""
RunPod Serverless GPU Worker for High-Resolution Background Removal & Alpha Matting.
Integrates with RunPod Serverless API contract:
Input payload:
{
    "input": {
        "image": "<base64 encoded bytes or HTTPS URL>",
        "endpoint": "remove" | "matting",
        "refine": true | false,
        "quality": "fast" | "balanced" | "quality"
    }
}
Output payload:
{
    "output_image_base64": "<base64 encoded RGBA PNG>",
    "metrics": {
        "inference_ms": ...,
        "refinement_mode": "alpha-matting" | "standard",
        "quality": "balanced"
    }
}
"""

import os
import io
import time
import base64
import urllib.request
from PIL import Image

try:
    import runpod
except ImportError:
    runpod = None

from alpha_matting import refine_alpha_matting_pipeline, HAS_PYMATTING, HAS_CV2
from rembg import new_session, remove

MODEL_NAME = os.getenv("REMBG_MODEL", "u2net").strip()
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 15 * 1024 * 1024))
MAX_MATTING_PIXELS = int(os.getenv("MAX_MATTING_PIXELS", 4194304))

print(f"[runpod-worker] Initializing ONNX / rembg session with model: '{MODEL_NAME}'...", flush=True)
SESSION = new_session(MODEL_NAME)
print(f"[runpod-worker] Model session ready. PyMatting: {HAS_PYMATTING}, OpenCV: {HAS_CV2}", flush=True)

def handler(job):
    """
    RunPod Serverless handler function called for each queued job.
    """
    t0 = time.time()
    job_input = job.get("input", {})

    image_data = job_input.get("image")
    if not image_data:
        return {"error": "Missing 'image' parameter in job input (must be base64 string or HTTP/HTTPS URL)."}

    mode = str(job_input.get("mode", "whole_product")).lower().strip()
    refine = bool(job_input.get("refine", False))
    quality = str(job_input.get("quality", "balanced")).lower()
    if quality not in ["fast", "balanced", "quality"]:
        quality = "balanced"

    endpoint = job_input.get("endpoint", "remove")
    if endpoint == "matting":
        refine = True

    # 1. Ingest image from URL or base64
    try:
        if str(image_data).startswith("http://") or str(image_data).startswith("https://"):
            req = urllib.request.Request(image_data, headers={"User-Agent": "RunPod-MathWorker/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw_bytes = resp.read()
        else:
            # Handle base64 string (stripping data:image/...;base64, prefix if present)
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            raw_bytes = base64.b64decode(image_data)
    except Exception as e:
        return {"error": f"Failed to decode image input: {str(e)}"}

    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        return {"error": f"Image size ({len(raw_bytes)} bytes) exceeds limit of {MAX_UPLOAD_BYTES} bytes."}

    # 2. Decode with PIL
    try:
        orig_img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
        orig_size = orig_img.size
        pixel_count = orig_size[0] * orig_size[1]
        if pixel_count > MAX_MATTING_PIXELS * 4:
            return {"error": f"Image dimensions {orig_size[0]}x{orig_size[1]} ({pixel_count} px) exceed maximum supported limit."}
    except Exception as e:
        return {"error": f"Failed to parse image with PIL: {str(e)}"}

    # 3. Execute inference
    try:
        coarse_cutout = remove(orig_img, session=SESSION)
        coarse_alpha = coarse_cutout.split()[3]

        if refine:
            refined_alpha = refine_alpha_matting_pipeline(
                rgb_pil=orig_img.convert("RGB"),
                coarse_alpha_pil=coarse_alpha,
                quality=quality
            )
            r, g, b, _ = orig_img.split()
            composed = Image.merge("RGBA", (r, g, b, refined_alpha))
            mode_label = "alpha-matting"
        else:
            r, g, b, _ = orig_img.split()
            composed = Image.merge("RGBA", (r, g, b, coarse_alpha))
            mode_label = "standard"

        out_buf = io.BytesIO()
        composed.save(out_buf, format="PNG", optimize=False)
        out_base64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")
        inference_time_ms = round((time.time() - t0) * 1000)

        return {
            "output_image_base64": f"data:image/png;base64,{out_base64}",
            "metrics": {
                "inference_ms": inference_time_ms,
                "selection_mode": mode,
                "refinement_mode": mode_label,
                "quality": quality,
                "original_size": f"{orig_size[0]}x{orig_size[1]}",
                "model": MODEL_NAME
            }
        }
    except Exception as e:
        return {"error": f"Inference processing failed: {str(e)}"}

if __name__ == "__main__":
    if runpod:
        runpod.serverless.start({"handler": handler})
    else:
        print("[runpod-worker] runpod module not installed. Running in mock/standalone mode.")
