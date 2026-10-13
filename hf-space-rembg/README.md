---
title: PLP Rembg Core
emoji: ✂️
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# ✂️ PLP Math Content — Background Removal Core (Pure FastAPI)

100% Free Open-Source Background Removal Microservice powered by FastAPI and `rembg` (U2Net / BiRefNet).

## 🚀 API Endpoints

- **GET `/`**: Mandatory root health check (`{"status": "alive"}`) for Hugging Face proxy.
- **POST `/api/remove`**: Accepts multipart/form-data with `image` file, returns transparent PNG binary.
- **GET `/docs`**: Automatic OpenAPI / Swagger UI interactive documentation.

## 🔗 Connecting to Next.js Vercel App

In your Next.js project's `.env.local` or Vercel Environment Variables:

```env
REMBG_SPACE_URL=https://<your-username>-<your-space-name>.hf.space
```
