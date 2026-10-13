FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system libraries needed by Pillow / OpenCV / ONNX
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download default U2Net model weights during build to make cold-starts instantaneous
RUN python -c "from rembg import new_session; new_session('u2net')"

# Copy application files
COPY app.py .

# Hugging Face Spaces expose port 7860
EXPOSE 7860

# Run FastAPI / Uvicorn server on port 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
