---
title: Plp Math Content
emoji: ✂️
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# ✂️ PLP Math Content — Background Removal Core (Pure FastAPI)

100% Free Open-Source Background Removal Microservice powered by FastAPI and `rembg` (U2Net).

## 🚀 API Endpoints

- **GET `/health`**: Health check endpoint (`{"status": "ok", "model_loaded": true}`)
- **POST `/api/remove`**: Accepts multipart/form-data with `image` file, returns transparent PNG binary.
- **POST `/api/remove-bg`**: Alias for `/api/remove`.
- **GET `/docs`**: Automatic OpenAPI / Swagger UI interactive documentation.
