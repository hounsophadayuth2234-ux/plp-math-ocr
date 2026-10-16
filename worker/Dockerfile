FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=4 \
    OPENBLAS_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    VECLIB_MAXIMUM_THREADS=4 \
    NUMEXPR_NUM_THREADS=4 \
    U2NET_HOME=/home/appuser/.u2net

WORKDIR /app

# Install system libraries needed by ONNX Runtime, PyMatting, and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root worker user
RUN useradd -m -u 1000 appuser && \
    mkdir -p /home/appuser/.u2net && \
    chown -R appuser:appuser /home/appuser /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download default model weights during container build as appuser
# This ensures zero cold-start model download delay on the first incoming request
USER appuser
RUN python -c "from rembg import new_session; new_session('u2net')"

COPY main.py alpha_matting.py ./

ENV REMBG_MODEL=u2net \
    PORT=8000 \
    MAX_UPLOAD_BYTES=15728640 \
    MAX_MATTING_PIXELS=4194304

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
