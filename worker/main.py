import os
import sys
import time
import io
from fastapi import FastAPI, UploadFile, File, Header, Query, HTTPException, status
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from rembg import new_session, remove
from alpha_matting import refine_alpha_matting_pipeline, HAS_PYMATTING, HAS_CV2, MAX_MATTING_PIXELS

MODEL_NAME = os.getenv("REMBG_MODEL", "u2net").strip()
AUTH_TOKEN = os.getenv("WORKER_AUTH_TOKEN", "").strip()
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 15 * 1024 * 1024))  # 15 MB
START_TIME = time.time()

print(f"[worker] Initializing rembg session with model: '{MODEL_NAME}'...", flush=True)
# Process-level session initialized once at startup and reused for all requests
session = new_session(MODEL_NAME)
print(f"[worker] Model session ready. PyMatting: {HAS_PYMATTING}, OpenCV: {HAS_CV2}", flush=True)

app = FastAPI(
    title="Background Removal Microservice with Alpha Matting",
    version="2.1.0",
    description="FastAPI + rembg worker with Closed-Form Alpha Matting and edge-aware refinement."
)

# CORS configuration: limit to ALLOWED_ORIGINS in production if set
raw_allowed = os.getenv("ALLOWED_ORIGINS", "*").strip()
if raw_allowed == "*":
    origins = ["*"]
else:
    origins = [orig.strip() for orig in raw_allowed.split(",") if orig.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=raw_allowed != "*",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

def verify_token(authorization: str | None):
    if not AUTH_TOKEN:
        return
    expected = f"Bearer {AUTH_TOKEN}"
    if not authorization or authorization.strip() != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: invalid or missing bearer token."
        )

@app.get("/health")
async def health(authorization: str | None = Header(None)):
    """Health check endpoint. Confirms service is live, model is loaded, and reports matting features."""
    verify_token(authorization)
    return {
        "status": "ok",
        "service": "rembg-fastapi-worker",
        "model": MODEL_NAME,
        "alpha_matting_supported": True,
        "pymatting_installed": HAS_PYMATTING,
        "opencv_installed": HAS_CV2,
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "max_matting_pixels": MAX_MATTING_PIXELS,
        "uptime_seconds": round(time.time() - START_TIME, 1)
    }

async def _process_image_request(
    image: UploadFile,
    authorization: str | None,
    refine: bool,
    quality: str,
    mode: str = "whole_product",
    positive_points: str | None = None,
    negative_points: str | None = None,
    boxes: str | None = None,
    polygon: str | None = None
) -> Response:
    verify_token(authorization)

    # 1. Validate Content-Type
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    ct = (image.content_type or "").lower()
    if ct and not any(ct.startswith(t) for t in allowed_types):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type '{ct}'. Allowed: PNG, JPEG, WebP."
        )

    # 2. Read image bytes and validate upload size
    content = await image.read()
    if not content or len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is empty (0 bytes)."
        )

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size ({len(content):,} bytes) exceeds the limit of {MAX_UPLOAD_BYTES:,} bytes."
        )

    # 3. Decode & validate image integrity
    try:
        probe = Image.open(io.BytesIO(content))
        probe.verify()
        orig_img = Image.open(io.BytesIO(content)).convert("RGBA")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or corrupted image format: {str(e)}"
        )

    orig_size = orig_img.size
    total_pixels = orig_size[0] * orig_size[1]

    # Validate decoded pixel count
    if total_pixels > MAX_MATTING_PIXELS * 4:  # Hard safety ceiling (e.g. > 16 megapixels)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Decoded image dimensions ({orig_size[0]}x{orig_size[1]} = {total_pixels:,} pixels) exceed safety limit."
        )

    # Normalize quality string
    quality = quality.lower().strip()
    if quality not in ["fast", "balanced", "quality"]:
        quality = "balanced"

    t0 = time.time()
    try:
        # Step 1: Run coarse background removal
        coarse_bytes = remove(content, session=session)
        coarse_rgba = Image.open(io.BytesIO(coarse_bytes)).convert("RGBA")

        # Ensure coarse mask matches original size
        if coarse_rgba.size != orig_size:
            coarse_rgba = coarse_rgba.resize(orig_size, Image.LANCZOS)

        # Extract coarse alpha channel
        _, _, _, coarse_alpha = coarse_rgba.split()
        alpha_np = np.array(coarse_alpha, dtype=np.uint8)

        # Stage A: Container & contents separation if contents_only is requested
        if mode == "contents_only":
            fg_indices = np.where(alpha_np > 128)
            if len(fg_indices[0]) > 100:
                min_y, max_y = np.min(fg_indices[0]), np.max(fg_indices[0])
                min_x, max_x = np.min(fg_indices[1]), np.max(fg_indices[1])
                bw = max_x - min_x + 1
                bh = max_y - min_y + 1
                orig_np = np.array(orig_img)
                # Outer border region of the foreground corresponds to box/container walls
                for y in range(min_y, max_y + 1):
                    for x in range(min_x, max_x + 1):
                        if alpha_np[y, x] <= 128:
                            continue
                        dist_border = min(x - min_x, max_x - x, y - min_y, max_y - y)
                        if dist_border < min(bw, bh) * 0.18:
                            # Strip outer box wall
                            alpha_np[y, x] = 0

        # Apply interactive point corrections if supplied
        import json
        if positive_points:
            try:
                pts = json.loads(positive_points) if isinstance(positive_points, str) else positive_points
                for px, py in pts:
                    cx, cy = int(round(px)), int(round(py))
                    cv2.circle(alpha_np, (cx, cy), 18, 255, -1) if HAS_CV2 else None
            except Exception:
                pass
        if negative_points:
            try:
                pts = json.loads(negative_points) if isinstance(negative_points, str) else negative_points
                for nx, ny in pts:
                    cx, cy = int(round(nx)), int(round(ny))
                    cv2.circle(alpha_np, (cx, cy), 18, 0, -1) if HAS_CV2 else None
            except Exception:
                pass

        coarse_alpha = Image.fromarray(alpha_np, mode="L")

        if refine:
            # Step 2: Full Alpha Matting Pipeline
            composed = refine_alpha_matting_pipeline(
                orig_img=orig_img,
                coarse_alpha_img=coarse_alpha,
                quality=quality
            )
            mode_label = "alpha-matting"
        else:
            # Standard mode: compose original RGB + refined alpha
            r_orig, g_orig, b_orig, _ = orig_img.split()
            composed = Image.merge("RGBA", (r_orig, g_orig, b_orig, coarse_alpha))
            mode_label = "standard"

        inference_time_ms = round((time.time() - t0) * 1000)

        out_buf = io.BytesIO()
        composed.save(out_buf, format="PNG", optimize=False)
        output_bytes = out_buf.getvalue()

        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={
                "Content-Type": "image/png",
                "X-Processing-Engine": "rembg-fastapi-worker",
                "X-Segmentation-Model": MODEL_NAME,
                "X-Selection-Mode": mode,
                "X-Refinement-Mode": mode_label,
                "X-Matting-Quality": quality,
                "X-Inference-Time-Ms": str(inference_time_ms),
                "X-Original-Size": f"{orig_size[0]}x{orig_size[1]}",
                "Cache-Control": "no-store, private"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Background removal inference error: {str(e)}"
        )

@app.post("/remove")
async def remove_background(
    image: UploadFile = File(...),
    refine: bool = Query(False, description="Opt-in Alpha Matting refinement"),
    quality: str = Query("balanced", description="Refinement quality: fast, balanced, quality"),
    mode: str = Query("whole_product", description="Selection mode: whole_product, contents_only, custom"),
    positive_points: str | None = Query(None, description="JSON array of positive points"),
    negative_points: str | None = Query(None, description="JSON array of negative points"),
    boxes: str | None = Query(None, description="JSON array of bounding boxes"),
    polygon: str | None = Query(None, description="JSON array of polygon coordinates"),
    authorization: str | None = Header(None)
):
    """
    Standard background removal endpoint with opt-in Alpha Matting and object selection.
    """
    return await _process_image_request(
        image=image,
        authorization=authorization,
        refine=refine,
        quality=quality,
        mode=mode,
        positive_points=positive_points,
        negative_points=negative_points,
        boxes=boxes,
        polygon=polygon
    )

@app.post("/matting")
async def alpha_matting_endpoint(
    image: UploadFile = File(...),
    quality: str = Query("balanced", description="Refinement quality: fast, balanced, quality"),
    mode: str = Query("whole_product", description="Selection mode"),
    authorization: str | None = Header(None)
):
    """
    Dedicated Alpha Matting endpoint.
    """
    return await _process_image_request(
        image=image,
        authorization=authorization,
        refine=True,
        quality=quality,
        mode=mode
    )

