---
title: Plp Math Content
emoji: ✂️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# ✂️ PLP Math Content — Multi-Model Core (Pure FastAPI)

100% Free Open-Source Microservice for Educational Background Removal and Real AI Image Super-Resolution.

## 🚀 API Endpoints

- **GET `/health`**: Health check endpoint returning model readiness (`{"status": "ok", "model_loaded": true, "upscaler_loaded": true}`).
- **POST `/api/remove`**: Background removal endpoint (rembg), returns transparent PNG binary.
- **POST `/api/remove-bg`**: Alias for `/api/remove`.
- **POST `/api/upscale`**: Real AI 4x Super-Resolution endpoint (Real-ESRGAN Compact ONNX), returns 4x upscaled PNG binary.
- **GET `/docs`**: Automatic OpenAPI / Swagger UI interactive documentation.
