"""
PLP Math Content — Background Removal Pure FastAPI Microservice
Powered by open-source rembg (u2net)
Designed for Hugging Face Spaces (Docker SDK / CPU Basic - 100% Free Tier).

CRITICAL SPECIFICATIONS:
1. Pure FastAPI application with lifespan model preloading.
2. Health check: @app.get("/health") -> {"status": "ok", "model_loaded": true}.
3. Concurrency-bounded inference using asyncio.Semaphore to protect CPU.
4. Input validation: size limit, magic bytes, Pillow decompression bomb guard.
5. Proportional downsampling: images with max dimension > 1500px downscaled to 1500px.
6. Fast inference by default: alpha_matting=False unless explicitly requested.
7. Safe error responses: {"error": "..."} without stack traces or secrets.
"""

import os
import io
import asyncio
from contextlib import asynccontextmanager
from typing import Optional, Tuple
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import rembg
from rembg import remove, new_session

# Constants
MAX_INFERENCE_DIMENSION = 1500
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_PIXELS = 16_777_216  # 16 MP safe limit
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

MODEL_NAME = os.getenv("REMBG_MODEL", "isnet-general-use")
MAX_CONCURRENT_INFERENCE = int(os.getenv("MAX_CONCURRENT_INFERENCE", "4"))
INFERENCE_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_INFERENCE)

GLOBAL_REMBG_SESSION = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager: preloads the rembg session once at application startup.
    Fails startup clearly if model cannot load.
    Cleans up session reference at shutdown.
    """
    global GLOBAL_REMBG_SESSION
    print(f"[*] Preloading rembg session with model '{MODEL_NAME}'...")
    try:
        GLOBAL_REMBG_SESSION = new_session(MODEL_NAME)
        print(f"[✓] Model session '{MODEL_NAME}' successfully loaded into memory.")
    except Exception as exc:
        print(f"[!] Critical startup failure: Unable to load rembg model '{MODEL_NAME}': {exc}")
        raise RuntimeError(f"Failed to load rembg model '{MODEL_NAME}': {exc}") from exc
    yield
    print("[*] Clearing rembg model session during shutdown...")
    GLOBAL_REMBG_SESSION = None


# Initialize FastAPI with lifespan hook
app = FastAPI(
    title="PLP Math Content — Rembg Segmentation Core",
    description="High-Speed Pure FastAPI Microservice for Educational Background Removal",
    version="2.0.0",
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
        content={"error": "An error occurred during background removal processing."},
        headers={"Cache-Control": "no-store"},
    )


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
    Decodes image with Pillow, verifies pixel count safety,
    proportionally resizes so that max dimension <= 1500px,
    and returns (bytes_to_infer, original_width, original_height).
    Preserves alpha channel if present. Small images are not upscaled.
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


# ─────────────────────────────────────────────────────────────
# 1. Mandatory Health Check Endpoints
# ─────────────────────────────────────────────────────────────
@app.get("/")
def root_health_check():
    """Mandatory root health check."""
    return {
        "status": "ok",
        "model_loaded": GLOBAL_REMBG_SESSION is not None,
    }


@app.get("/health")
@app.get("/api/health")
def health():
    """Health check endpoint required by Hugging Face Space specification."""
    return {
        "status": "ok",
        "model_loaded": GLOBAL_REMBG_SESSION is not None,
    }


# ─────────────────────────────────────────────────────────────
# 2. Production Background Removal Endpoints
# ─────────────────────────────────────────────────────────────
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

        # Case 1: Standard multipart/form-data with 'image' field
        if image is not None:
            input_bytes = await image.read()
        else:
            # Case 2: Inspect form manually for 'image' or 'file'
            form = await request.form()
            file_field = form.get("image") or form.get("file")
            if file_field and hasattr(file_field, "read"):
                input_bytes = await file_field.read()
            else:
                # Case 3: Raw binary request body
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

        # Validate magic bytes / image signature
        validate_image_bytes(input_bytes)

        # Check if model session is initialized
        if GLOBAL_REMBG_SESSION is None:
            raise HTTPException(
                status_code=503,
                detail={"error": "Model session is not ready. Please retry in a few moments."}
            )

        # Determine alpha matting setting (defaults to False for CPU performance)
        use_alpha_matting = alpha_matting
        if form:
            am_form = form.get("alpha_matting")
            if am_form is not None:
                use_alpha_matting = str(am_form).lower() in ("true", "1", "yes")

        # Proportional resize if largest dimension > 1500px
        inference_bytes, orig_w, orig_h = process_and_resize_input_image(input_bytes)

        # Concurrency-bounded inference
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
        print(f"[!] Processing exception: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Background segmentation failed during processing."}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
