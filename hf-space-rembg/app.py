"""
PLP Math Content — Background Removal Pure FastAPI Microservice
Powered by open-source rembg (U2Net / BiRefNet)
Designed for Hugging Face Spaces (Docker SDK / CPU Basic - 100% Free Tier).

CRITICAL SPECIFICATIONS:
1. Pure FastAPI application (zero Gradio dependencies).
2. Mandatory root health check: @app.get("/") -> {"status": "alive"}.
   This ensures Hugging Face's container health proxy passes immediately.
3. Fast background removal endpoint: @app.post("/api/remove") (and @app.post("/api/remove-bg")).
4. NO uvicorn.run() at bottom; Hugging Face / Docker runs the server automatically.
"""

import os
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from rembg import remove, new_session

# Initialize Pure FastAPI Application
app = FastAPI(
    title="PLP Math Content — Rembg Segmentation Core",
    description="100% Free Pure FastAPI Microservice for Educational Background Removal",
    version="1.0.0",
)

# Enable CORS for Next.js frontend on Vercel or localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-load rembg model session once at container boot
MODEL_NAME = os.getenv("REMBG_MODEL", "u2net")
print(f"[*] Preloading rembg session with model '{MODEL_NAME}'...")
session = new_session(MODEL_NAME)
print(f"[✓] Model session '{MODEL_NAME}' successfully loaded into memory.")


# ─────────────────────────────────────────────────────────────
# 1. Mandatory Root Health Check for Hugging Face Proxy
# ─────────────────────────────────────────────────────────────
@app.get("/")
def root_health_check():
    """
    Mandatory root health check.
    Hugging Face's reverse proxy queries GET / to verify the Space is live.
    """
    return {
        "status": "alive",
        "service": "PLP Rembg Core",
        "model": MODEL_NAME,
        "engine": "pure-fastapi-rembg",
    }


@app.get("/health")
@app.get("/api/health")
def api_health():
    """Secondary health check endpoint."""
    return {"status": "alive"}


# ─────────────────────────────────────────────────────────────
# 2. Production Background Removal Endpoint
# ─────────────────────────────────────────────────────────────
@app.post("/api/remove")
@app.post("/api/remove-bg")
async def remove_background(
    request: Request,
    image: UploadFile = File(None),
):
    """
    Accepts an uploaded image file via multipart/form-data or raw bytes,
    removes the background cleanly with alpha matting, and returns transparent PNG bytes.
    """
    try:
        input_bytes = None

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
                detail="No image data received. Please send multipart/form-data with 'image' field."
            )

        print(f"[*] Removing background for payload of {len(input_bytes)} bytes...")

        # Process with rembg using alpha matting for clean hair, formulas, and edges
        output_bytes = remove(
            input_bytes,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )

        print(f"[✓] Segmentation complete. Returning {len(output_bytes)} PNG bytes.")

        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=3600",
                "X-Model-Used": MODEL_NAME,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[!] Processing exception: {exc}")
        raise HTTPException(
            status_code=500,
            detail=f"Segmentation failed: {str(exc)}"
        )
