---
title: PLP Rembg Core
emoji: ✂️
colorFrom: indigo
colorTo: cyan
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: mit
---

# ✂️ PLP Math Content — Background Removal Core

Official 100% Free Open-Source Background Removal Microservice powered by `rembg` (U2Net / BiRefNet).

## 🚀 Live Endpoints

- **Web UI**: `/` (Interactive browser test page)
- **REST API**: `/api/remove-bg` (POST multipart/form-data with `image` file)
- **Health Check**: `/health` or `/api/health` (JSON status)

## 🔗 Connecting to Next.js Vercel App

In your Next.js project's `.env.local` or Vercel Environment Variables:

```env
REMBG_SPACE_URL=https://<your-username>-<your-space-name>.hf.space
```

No API keys or subscriptions required!
