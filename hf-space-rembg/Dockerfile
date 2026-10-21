FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV HOST=0.0.0.0

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

# Copy application files
COPY app.py /app/app.py

# Hugging Face Spaces expose port 7860
EXPOSE 7860

# Run FastAPI application via uvicorn on port 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
