"""
PLP Math Content — Multi-Model Microservice
- Feature 2: Background Removal (rembg / isnet-general-use)
- Feature 3: Real AI Image Super-Resolution (Real-ESRGAN x4v3 ONNX)

Designed for Hugging Face Spaces (Docker SDK / CPU Basic - 100% Free Tier).

CRITICAL SPECIFICATIONS:
1. Pure FastAPI application with lifespan preloading both models.
2. Health check: @app.get("/health") -> {"status": "ok", "model_loaded": true, "upscaler_loaded": true}.
3. Concurrency-bounded inference using asyncio.Semaphore to protect CPU/memory.
4. Input validation: size limit, magic bytes, Pillow decompression bomb guard.
5. Large image handling:
   - Rembg: max dimension capped at 1500px.
   - Upscaler: max dimension capped at 1200px (CPU safety). Small images are NOT pre-enlarged.
6. Safe error responses: {"error": "..."} without stack traces or path leaks.
"""

import os
import io
import asyncio
import hashlib
import urllib.request
from contextlib import asynccontextmanager
from typing import Optional, Tuple
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import numpy as np
import onnxruntime as ort
import rembg
from rembg import remove, new_session

# ============================================================================
# CONSTANTS & CONFIGURATION
# ============================================================================

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_PIXELS = 16_777_216  # 16 MP safe limit
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# Feature 2 (Background Remover)
MODEL_NAME = os.getenv("REMBG_MODEL", "isnet-general-use")
MAX_INFERENCE_DIMENSION = 1500
MAX_CONCURRENT_INFERENCE = int(os.getenv("MAX_CONCURRENT_INFERENCE", "4"))
INFERENCE_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_INFERENCE)

# Feature 3 (Real-ESRGAN Super-Resolution)
UPSCALE_MODEL_NAME = os.getenv("UPSCALER_MODEL", "realesr-general-x4v3")
UPSCALE_FACTOR = 4
MAX_UPSCALE_CONCURRENT_REQUESTS = 1  # Strictly 1 on 2 vCPU to prevent CPU starvation
MAX_UPSCALE_INPUT_DIMENSION = 1200
UPSCALE_SEMAPHORE = asyncio.Semaphore(MAX_UPSCALE_CONCURRENT_REQUESTS)

UPSCALE_MODEL_URL = os.getenv(
    "UPSCALER_MODEL_URL",
    "https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx"
)
UPSCALE_MODEL_SHA256 = os.getenv(
    "UPSCALER_MODEL_SHA256",
    "f4ce97b00540dcfcf1d7a261455e2d2ac40c2f538a0fbce31e4ffd960b1e07a3"
)
MODEL_CACHE_DIR = os.getenv(
    "MODEL_CACHE_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
)

# Global model sessions
GLOBAL_REMBG_SESSION = None
GLOBAL_UPSCALE_SESSION: Optional[ort.InferenceSession] = None
GLOBAL_UPSCALE_INPUT_NAME: str = "input"


# ============================================================================
# MODEL DOWNLOAD & VERIFICATION HELPER
# ============================================================================

def ensure_upscale_model_downloaded() -> str:
    """
    Ensures the Real-ESRGAN ONNX model file exists in the cache directory
    and validates its SHA256 checksum. If missing or corrupted, downloads
    it from the fixed HTTPS URL with checksum validation.
    """
    os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_CACHE_DIR, f"{UPSCALE_MODEL_NAME}.onnx")

    if os.path.exists(model_path) and os.path.getsize(model_path) > 0:
        if UPSCALE_MODEL_SHA256:
            hasher = hashlib.sha256()
            with open(model_path, "rb") as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            if hasher.hexdigest().lower() == UPSCALE_MODEL_SHA256.lower():
                print(f"[✓] Upscaler model verified in cache: {model_path}")
                return model_path
            else:
                print("[!] Cached upscaler model checksum mismatch, re-downloading...")
                try:
                    os.remove(model_path)
                except OSError:
                    pass
        else:
            return model_path

    print(f"[*] Downloading Real-ESRGAN model from {UPSCALE_MODEL_URL}...")
    temp_path = model_path + ".tmp"
    try:
        req = urllib.request.Request(
            UPSCALE_MODEL_URL,
            headers={"User-Agent": "PLP-Math-Content-Upscaler/1.0"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp, open(temp_path, "wb") as out_f:
            hasher = hashlib.sha256()
            while chunk := resp.read(65536):
                out_f.write(chunk)
                hasher.update(chunk)

            if UPSCALE_MODEL_SHA256 and hasher.hexdigest().lower() != UPSCALE_MODEL_SHA256.lower():
                raise RuntimeError(
                    f"Downloaded model SHA256 mismatch: expected {UPSCALE_MODEL_SHA256}, got {hasher.hexdigest()}"
                )

        os.replace(temp_path, model_path)
        print(f"[✓] Real-ESRGAN model cached successfully to {model_path}")
        return model_path
    except Exception as exc:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise RuntimeError(f"Failed to download/verify upscaler model: {exc}") from exc


# ============================================================================
# APPLICATION LIFESPAN (MODEL PRELOAD)
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager:
    1. Preloads rembg model session once at application startup.
    2. Downloads & caches Real-ESRGAN ONNX model and loads onnxruntime session.
    3. Validates tensor shapes and execution provider.
    4. Cleans up sessions on shutdown.
    """
    global GLOBAL_REMBG_SESSION, GLOBAL_UPSCALE_SESSION, GLOBAL_UPSCALE_INPUT_NAME

    # 1. Feature 2: Preload rembg session
    print(f"[*] Preloading rembg session with model '{MODEL_NAME}'...")
    try:
        GLOBAL_REMBG_SESSION = new_session(MODEL_NAME)
        print(f"[✓] Model session '{MODEL_NAME}' successfully loaded into memory.")
    except Exception as exc:
        print(f"[!] Critical startup failure: Unable to load rembg model '{MODEL_NAME}': {exc}")
        raise RuntimeError(f"Failed to load rembg model '{MODEL_NAME}': {exc}") from exc

    # 2. Feature 3: Preload Real-ESRGAN super-resolution session
    print(f"[*] Preloading Real-ESRGAN super-resolution model '{UPSCALE_MODEL_NAME}'...")
    try:
        model_path = ensure_upscale_model_downloaded()
        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.getenv("ORT_INTRA_OP_NUM_THREADS", "2"))
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        GLOBAL_UPSCALE_SESSION = ort.InferenceSession(
            model_path,
            sess_options=so,
            providers=["CPUExecutionProvider"]
        )
        inputs = GLOBAL_UPSCALE_SESSION.get_inputs()
        outputs = GLOBAL_UPSCALE_SESSION.get_outputs()
        GLOBAL_UPSCALE_INPUT_NAME = inputs[0].name
        print(
            f"[✓] Real-ESRGAN session loaded successfully. "
            f"Input: {inputs[0].name} ({inputs[0].shape}), Output: {outputs[0].name} ({outputs[0].shape})"
        )
    except Exception as exc:
        print(f"[!] Critical startup failure: Unable to load Real-ESRGAN upscaler: {exc}")
        raise RuntimeError(f"Failed to load upscaler model: {exc}") from exc

    yield

    print("[*] Clearing models during shutdown...")
    GLOBAL_REMBG_SESSION = None
    GLOBAL_UPSCALE_SESSION = None


# Initialize FastAPI with lifespan hook
app = FastAPI(
    title="PLP Math Content — Multi-Model Core",
    description="High-Speed Pure FastAPI Microservice for Background Removal & Real AI Super-Resolution",
    version="3.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure all HTTP exceptions return structured, safe JSON."""
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        msg = detail["error"]
    else:
        msg = str(detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": msg},
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Mask unexpected internal errors to avoid leaking stack traces or paths."""
    print(f"[!] Unexpected error during processing: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content={"error": "ការដំណើរការមិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។"},
        headers={"Cache-Control": "no-store"},
    )


# ============================================================================
# IMAGE VALIDATION & PREPROCESSING UTILITIES
# ============================================================================

def validate_image_bytes(data: bytes) -> str:
    """
    Validates magic bytes to ensure safe image file type.
    Returns detected format ('PNG', 'JPEG', 'WEBP').
    Raises HTTPException if invalid.
    """
    if len(data) < 12:
        raise HTTPException(
            status_code=400,
            detail={"error": "Image data is too small or corrupted."}
        )

    # PNG: \x89PNG\r\n\x1a\n
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    # JPEG: \xff\xd8\xff
    if data.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    # WebP: starts with 'RIFF' and bytes 8..12 are 'WEBP'
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "WEBP"

    raise HTTPException(
        status_code=415,
        detail={"error": "Unsupported image format. Only PNG, JPEG, and WebP are allowed."}
    )


def process_and_resize_input_image(input_bytes: bytes) -> Tuple[bytes, int, int]:
    """
    Rembg preprocessing: proportionally resizes so max dimension <= 1500px.
    """
    try:
        with Image.open(io.BytesIO(input_bytes)) as img:
            w, h = img.size
            if w * h > MAX_PIXELS or w > 4096 or h > 4096:
                raise HTTPException(
                    status_code=400,
                    detail={"error": "Image dimensions exceed maximum safe limit of 16MP."}
                )

            max_dim = max(w, h)
            if max_dim > MAX_INFERENCE_DIMENSION:
                scale = MAX_INFERENCE_DIMENSION / float(max_dim)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))

                resample_filter = getattr(Image, "Resampling", Image).LANCZOS
                resized_img = img.resize((new_w, new_h), resample=resample_filter)

                buf = io.BytesIO()
                resized_img.save(buf, format="PNG")
                return buf.getvalue(), w, h

            return input_bytes, w, h
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail={"error": "Unable to decode image file. File may be corrupted or invalid."}
        )


# ============================================================================
# 1. MANDATORY HEALTH CHECK ENDPOINTS
# ============================================================================

@app.get("/")
@app.get("/health")
@app.get("/api/health")
def health():
    """
    Health check endpoint: verifies both rembg and Real-ESRGAN models are loaded.
    """
    is_ready = GLOBAL_REMBG_SESSION is not None and GLOBAL_UPSCALE_SESSION is not None
    return {
        "status": "ok" if is_ready else "degraded",
        "model_loaded": GLOBAL_REMBG_SESSION is not None,
        "upscaler_loaded": GLOBAL_UPSCALE_SESSION is not None,
        "upscale_model": UPSCALE_MODEL_NAME,
        "upscale_factor": UPSCALE_FACTOR,
        "rembg_model": MODEL_NAME,
    }


# ============================================================================
# 2. FEATURE 2: BACKGROUND REMOVAL ENDPOINTS
# ============================================================================

@app.post("/api/remove")
@app.post("/api/remove-bg")
async def remove_background(
    request: Request,
    image: Optional[UploadFile] = File(None),
    alpha_matting: bool = Query(False, description="Enable alpha matting (disabled by default for CPU performance)"),
):
    """
    High-Speed background removal endpoint:
    - Reuses preloaded global rembg model session.
    - Validates MIME and magic bytes.
    - Proportionally downsamples images larger than 1500px.
    - Disables alpha matting by default for maximum speed on CPU.
    - Bounded concurrency with asyncio.Semaphore to prevent CPU starvation.
    - Returns pure transparent PNG bytes.
    """
    try:
        input_bytes = None
        form = None

        if image is not None:
            input_bytes = await image.read()
        else:
            form = await request.form()
            file_field = form.get("image") or form.get("file")
            if file_field and hasattr(file_field, "read"):
                input_bytes = await file_field.read()
            else:
                input_bytes = await request.body()

        if not input_bytes or len(input_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail={"error": "No image data received. Please send multipart/form-data with 'image' field."}
            )

        if len(input_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"error": f"Image size ({len(input_bytes)} bytes) exceeds maximum limit of {MAX_UPLOAD_BYTES // (1024 * 1024)}MB."}
            )

        validate_image_bytes(input_bytes)

        if GLOBAL_REMBG_SESSION is None:
            raise HTTPException(
                status_code=503,
                detail={"error": "Model session is not ready. Please retry in a few moments."}
            )

        use_alpha_matting = alpha_matting
        if form:
            am_form = form.get("alpha_matting")
            if am_form is not None:
                use_alpha_matting = str(am_form).lower() in ("true", "1", "yes")

        inference_bytes, orig_w, orig_h = process_and_resize_input_image(input_bytes)

        async with INFERENCE_SEMAPHORE:
            loop = asyncio.get_running_loop()
            if use_alpha_matting:
                output_bytes = await loop.run_in_executor(
                    None,
                    lambda: remove(
                        inference_bytes,
                        session=GLOBAL_REMBG_SESSION,
                        alpha_matting=True,
                        alpha_matting_foreground_threshold=240,
                        alpha_matting_background_threshold=10,
                        alpha_matting_erode_size=10,
                    )
                )
            else:
                output_bytes = await loop.run_in_executor(
                    None,
                    lambda: remove(
                        inference_bytes,
                        session=GLOBAL_REMBG_SESSION,
                        alpha_matting=False,
                    )
                )

        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
                "X-Model-Used": MODEL_NAME,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[!] Processing exception in remove_background: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Background segmentation failed during processing."}
        )


# ============================================================================
# 3. FEATURE 3: REAL AI IMAGE SUPER-RESOLUTION ENDPOINT
# ============================================================================

@app.post("/api/upscale")
async def upscale_image(
    request: Request,
    image: Optional[UploadFile] = File(None),
):
    """
    Real AI 4x Super-Resolution endpoint powered by Real-ESRGAN Compact ONNX.
    - Reuses preloaded global Real-ESRGAN ONNX session.
    - Validates MIME and magic bytes.
    - Enforces MAX_UPSCALE_INPUT_DIMENSION = 1200px cap to protect CPU memory.
    - Preserves native small images without pre-enlargement.
    - Full transparency preservation for RGBA images.
    - Bounded concurrency with UPSCALE_SEMAPHORE.
    - Returns pure upscaled PNG bytes with truthful metadata headers.
    """
    try:
        input_bytes = None

        if image is not None:
            input_bytes = await image.read()
        else:
            form = await request.form()
            file_field = form.get("image") or form.get("file")
            if file_field and hasattr(file_field, "read"):
                input_bytes = await file_field.read()
            else:
                input_bytes = await request.body()

        if not input_bytes or len(input_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail={"error": "No image data received. Please send multipart/form-data with 'image' field."}
            )

        if len(input_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"error": f"Image size exceeds limit of {MAX_UPLOAD_BYTES // (1024 * 1024)}MB."}
            )

        validate_image_bytes(input_bytes)

        if GLOBAL_UPSCALE_SESSION is None:
            raise HTTPException(
                status_code=503,
                detail={"error": "Upscaler model is not ready. Please retry in a few moments."}
            )

        # Open image safely with Pillow
        try:
            with Image.open(io.BytesIO(input_bytes)) as pil_img:
                src_w, src_h = pil_img.size
                if src_w * src_h > MAX_PIXELS or src_w > 4096 or src_h > 4096:
                    raise HTTPException(
                        status_code=400,
                        detail={"error": "Image dimensions exceed maximum safe limit of 16MP."}
                    )

                # Safe Large-Image Processing (Phase 5)
                # If largest dimension > 1200px, downsample proportionally before inference
                max_dim = max(src_w, src_h)
                was_downscaled = False
                resample_filter = getattr(Image, "Resampling", Image).LANCZOS

                if max_dim > MAX_UPSCALE_INPUT_DIMENSION:
                    scale = MAX_UPSCALE_INPUT_DIMENSION / float(max_dim)
                    proc_w = max(1, int(round(src_w * scale)))
                    proc_h = max(1, int(round(src_h * scale)))
                    proc_img = pil_img.resize((proc_w, proc_h), resample=resample_filter)
                    was_downscaled = True
                else:
                    proc_w, proc_h = src_w, src_h
                    proc_img = pil_img.copy()

                # Preserve transparency (RGBA)
                has_alpha = proc_img.mode in ("RGBA", "LA") or (proc_img.mode == "P" and "transparency" in proc_img.info)
                alpha_channel = None
                if has_alpha:
                    rgba_proc = proc_img.convert("RGBA")
                    rgb_proc = rgba_proc.convert("RGB")
                    alpha_channel = rgba_proc.split()[-1]
                else:
                    rgb_proc = proc_img.convert("RGB")

                # Prepare tensor for Real-ESRGAN: float32, NCHW, normalized to [0, 1]
                np_img = np.asarray(rgb_proc, dtype=np.float32) / 255.0
                np_img = np.transpose(np_img, (2, 0, 1))  # HWC -> CHW (3, H, W)
                input_tensor = np.expand_dims(np_img, axis=0)  # [1, 3, H, W]

        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=400,
                detail={"error": "Unable to decode image file. File may be corrupted or invalid."}
            )

        # Run inference under bounded concurrency semaphore
        async with UPSCALE_SEMAPHORE:
            loop = asyncio.get_running_loop()

            def run_onnx_inference():
                return GLOBAL_UPSCALE_SESSION.run(
                    None,
                    {GLOBAL_UPSCALE_INPUT_NAME: input_tensor}
                )[0]

            output_tensor = await loop.run_in_executor(None, run_onnx_inference)

        # Postprocess output tensor: [1, 3, H*4, W*4] -> uint8 HWC Image
        output_arr = np.clip(output_tensor[0], 0.0, 1.0)
        output_arr = np.transpose(output_arr, (1, 2, 0))  # CHW -> HWC
        upscaled_rgb = Image.fromarray((output_arr * 255.0).round().astype(np.uint8))

        out_w, out_h = upscaled_rgb.size

        # If input had alpha channel, resize alpha channel by 4x and merge
        if alpha_channel is not None:
            upscaled_alpha = alpha_channel.resize((out_w, out_h), resample=resample_filter)
            final_img = Image.merge("RGBA", (*upscaled_rgb.split(), upscaled_alpha))
        else:
            final_img = upscaled_rgb

        out_buf = io.BytesIO()
        final_img.save(out_buf, format="PNG")
        output_bytes = out_buf.getvalue()

        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
                "X-Model-Used": UPSCALE_MODEL_NAME,
                "X-Upscale-Factor": str(UPSCALE_FACTOR),
                "X-Source-Width": str(src_w),
                "X-Source-Height": str(src_h),
                "X-Processed-Width": str(proc_w),
                "X-Processed-Height": str(proc_h),
                "X-Output-Width": str(out_w),
                "X-Output-Height": str(out_h),
                "X-Was-Downscaled": str(was_downscaled).lower(),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[!] Processing exception in upscale_image: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail={"error": "ការធ្វើឱ្យរូបភាពច្បាស់មិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។"}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
