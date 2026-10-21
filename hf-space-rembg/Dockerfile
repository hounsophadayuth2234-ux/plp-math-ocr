FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV HOST=0.0.0.0
ENV MODEL_CACHE_DIR=/app/models

WORKDIR /app

# Install system libraries needed by Pillow / OpenCV / ONNX Runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Pre-download default isnet-general-use model weights during build to make cold-starts instantaneous
RUN python -c "from rembg import new_session; new_session('isnet-general-use')"

# Pre-download and verify Real-ESRGAN x4v3 ONNX model weights
RUN mkdir -p /app/models && \
    python -c "import urllib.request, hashlib; url='https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx'; path='/app/models/realesr-general-x4v3.onnx'; urllib.request.urlretrieve(url, path); sha=hashlib.sha256(open(path, 'rb').read()).hexdigest(); assert sha=='f4ce97b00540dcfcf1d7a261455e2d2ac40c2f538a0fbce31e4ffd960b1e07a3', f'Bad sha: {sha}'; print('Real-ESRGAN model baked into Docker image successfully.')"

# Copy application files
COPY app.py /app/app.py

# Hugging Face Spaces expose port 7860
EXPOSE 7860

# Run FastAPI application via uvicorn on port 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
