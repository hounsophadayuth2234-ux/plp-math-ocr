"""
PLP Math Content — Background Removal Python Microservice
Powered by open-source rembg (U2Net / BiRefNet)
Designed for 100% Free deployment on Hugging Face Spaces (CPU Basic - Free Tier).

Endpoints:
- GET  /              : Health check & service telemetry
- POST /api/remove-bg : Accepts image file (multipart or binary), removes background, returns PNG
- GET  /ui            : Interactive Gradio web interface for manual testing in the browser
"""

import io
import os
from fastapi import FastAPI, File, UploadFile, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from rembg import remove, new_session
from PIL import Image
import gradio as gr

# Initialize FastAPI App
app = FastAPI(
    title="PLP Math Content — Rembg Segmentation Core",
    description="100% Free Open-Source Background Removal Microservice for Educational Platform",
    version="1.0.0",
)

# Enable CORS for Next.js app on Vercel or localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-load rembg model session into memory once at startup
# "u2net" is the industry standard for high-fidelity segmentation.
# Alternative options: "isnet-general-use" or "birefnet-general"
MODEL_NAME = os.getenv("REMBG_MODEL", "u2net")
print(f"[*] Initializing rembg session with model '{MODEL_NAME}'...")
session = new_session(MODEL_NAME)
print(f"[✓] Model session '{MODEL_NAME}' loaded successfully.")


@app.get("/")
def health_check():
    """Health check endpoint for Vercel/Next.js heartbeat."""
    return {
        "status": "online",
        "service": "PLP Rembg Core",
        "model": MODEL_NAME,
        "engine": "open-source rembg",
        "endpoints": {
            "api": "/api/remove-bg",
            "ui": "/ui",
        },
    }


@app.post("/api/remove-bg")
@app.post("/remove-bg")
async def api_remove_background(
    request: Request,
    image: UploadFile = None,
):
    """
    Core API route called by the Next.js backend.
    Accepts an uploaded image file via multipart/form-data or raw request body,
    removes the background cleanly with alpha matting, and returns transparent PNG bytes.
    """
    try:
        input_bytes = None

        # Check if received as multipart form-data
        if image is not None:
            input_bytes = await image.read()
        else:
            # Check form data manually
            form = await request.form()
            file_field = form.get("image") or form.get("file")
            if file_field and hasattr(file_field, "read"):
                input_bytes = await file_field.read()
            else:
                # Raw binary body
                input_bytes = await request.body()

        if not input_bytes or len(input_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail="No image data provided in request. Send multipart/form-data with 'image' field."
            )

        print(f"[*] Processing background removal for {len(input_bytes)} bytes...")

        # Process with rembg (with alpha matting enabled for soft hair & subtle edges)
        output_bytes = remove(
            input_bytes,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10,
        )

        print(f"[✓] Background removed successfully ({len(output_bytes)} bytes returned).")

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
        print(f"[!] Error during segmentation: {exc}")
        raise HTTPException(status_code=500, detail=f"Rembg processing failed: {str(exc)}")


# ─────────────────────────────────────────────────────────────
# Interactive Gradio Web UI for Manual Testing
# ─────────────────────────────────────────────────────────────
def gradio_process(input_img):
    if input_img is None:
        return None
    # Convert PIL image to bytes
    buf = io.BytesIO()
    input_img.save(buf, format="PNG")
    input_bytes = buf.getvalue()
    
    # Process
    output_bytes = remove(input_bytes, session=session)
    return Image.open(io.BytesIO(output_bytes))


with gr.Blocks(title="PLP Math Content — Rembg Core") as demo:
    gr.Markdown("# ✂️ PLP Math Content — Background Removal Core")
    gr.Markdown(
        "Official 100% Free Open-Source Microservice for Hugging Face Spaces.\n\n"
        "Connect your Next.js application by setting `REMBG_SPACE_URL` in your `.env.local` to this Space's URL."
    )
    with gr.Row():
        with gr.Column():
            input_img = gr.Image(type="pil", label="Upload Source Image")
            run_btn = gr.Button("Remove Background", variant="primary")
        with gr.Column():
            output_img = gr.Image(type="pil", label="Transparent Cutout (PNG)")

    run_btn.click(fn=gradio_process, inputs=[input_img], outputs=[output_img])

# Mount Gradio onto the FastAPI app under /ui
app = gr.mount_gradio_app(app, demo, path="/ui")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
