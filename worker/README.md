# Background Removal Microservice (Python FastAPI + rembg)

This directory contains the production-compatible Remote Worker microservice for **Module 02 (AI Background Removal)** in AI Toolkit Hub.

---

## 1. Architecture & Design

- **Engine**: FastAPI + `rembg` (powered by ONNX Runtime) + PyMatting / Guided Filter
- **Model**: Default `u2net` (pre-trained Salient Object Detection, CPU-optimized) or `isnet-general-use`
- **Session Lifecycle**: Single persistent ONNX session initialized once on process startup (`new_session`) and reused across all requests, avoiding repeated weight initialization overhead.
- **Alpha Matting Pipeline**:
  - Conservative 3-class trimap construction (0: definite background, 128: unknown boundary, 255: definite foreground).
  - Closed-form alpha matting (Levin et al.) via PyMatting, with automatic pure-NumPy iterative guided propagation fallback.
  - Edge-aware Guided Filter pass to suppress residual color halos while aligning alpha with true RGB edges.
  - Original RGB restoration — guarantees non-boundary pixels are never altered or redrawn.
- **Contract**:
  - `GET /health` -> JSON `{ status: "ok", service: "rembg-fastapi-worker", model: "u2net", alpha_matting_supported: true, ... }`
  - `POST /remove` -> Standard background removal (backward-compatible)
  - `POST /remove?refine=true&quality=fast|balanced|quality` -> Opt-in Alpha Matting
  - `POST /matting?quality=fast|balanced|quality` -> Dedicated Alpha Matting endpoint

---

## 2. Alpha Matting Quality Presets

| Quality Preset | Max Solver Resolution | Erode/Dilate Radius | Guided Filter Radius / Eps | Best For |
| :--- | :--- | :--- | :--- | :--- |
| `fast` | 768px | 5px / 6px | $r=4, \varepsilon=10^{-4}$ | Quick previews, medium resolution, general portraits |
| `balanced` (Default) | 1024px | 7px / 8px | $r=6, \varepsilon=10^{-4}$ | Optimal balance: fine hair wisps, thin text, minimal latency |
| `quality` | 1536px | 9px / 10px | $r=8, \varepsilon=10^{-5}$ | Maximum fidelity: delicate mathematical formulas, fine fur, high-res portraits |

---

## 3. Model Selection & Limitations

| Model | Size | Strengths | Limitations |
| :--- | :--- | :--- | :--- |
| `u2net` (Default) | ~170 MB | Robust general segmentation on CPU; balanced memory footprint | Can occasionally soften ultra-fine hair strands or intricate mathematical notation |
| `isnet-general-use` | ~175 MB | Crisp high-frequency edges | Slightly higher inference latency |
| `birefnet-general` | ~450 MB | State-of-the-art bilateral refinement | Requires 4GB+ RAM, slower on CPU without GPU |

---

## 3. Resource Requirements & Cold Starts

- **RAM**: Minimum **1.5 GB**, recommended **2.0 GB+**.
- **CPU**: 2+ vCPU recommended for ~1.5s–3.5s per image inference.
- **Cold Start**:
  - The provided `Dockerfile` runs `new_session('u2net')` **during build time**, pre-caching weights in `/root/.u2net/`.
  - When deployed on container platforms (Railway, Render, Fly.io), the container boots in < 5 seconds without waiting to download weights on the first user request.
  - On platforms that spin down to zero (e.g. free Render instances), allow ~30–50s container boot time after idle sleep.

---

## 4. Local Development

### Option A: Using Docker (Recommended)
```bash
docker compose up -d --build
```
Worker will be live at `http://localhost:8000`. Test health:
```bash
curl http://localhost:8000/health
```

### Option B: Using Python Virtual Environment
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 5. Hosting Platform Evaluation & Comparison

For moving heavy AI inference away from Vercel Serverless Functions (which have a strict 4.5 MB request payload limit and memory/timeout caps), we evaluated 4 leading GPU inference platforms:

| Platform | Best For | Cold Start | Scale-to-Zero | Custom Docker Support | Cost Efficiency |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RunPod Serverless** *(Recommended)* | Custom GPU workers, high-throughput batching, flexible queuing | Fast (< 3s on active cache) | Yes (pay per ms of execution) | **Full Dockerfile** (`Dockerfile.runpod`) | Very high (~$0.0002–$0.0006/sec on RTX 4090/A4000) |
| **Modal** | Python-first GPU functions & rapid iterative deployment | Excellent (< 2s) | Yes | Containerized Python definitions | High, Python native |
| **Replicate Deployments** | Managed private endpoints with UI monitoring & auto-scaling | Fast | Yes | Cog format / Git repo | High, with platform management premium |
| **Google Cloud Run GPU** | Enterprise GCP integration with managed IAM & VPC | Variable (5–12s) | Yes (with minimum instances = 0) | Full Container Image | Enterprise pricing |

### Why RunPod Serverless was Chosen:
1. **Custom Docker Workers**: Full control over system libraries (libgl, openblas, libgomp) needed for OpenCV and PyMatting.
2. **GPU & Memory Flexibility**: Allows mapping to 16GB–24GB VRAM GPUs (RTX 4090, A4000, L4) to process high-resolution images in < 400ms.
3. **True Scale-to-Zero**: Zero ongoing compute billing when educational LMS traffic is idle overnight.
4. **Queue Management**: Built-in HTTP job submission and status polling prevents serverless timeout cascading.

---

## 6. Model License Audit: BRIA RMBG-2.0 vs U²-Net vs ISNet

> [!WARNING]
> **BRIA RMBG-2.0 License Restriction**:
> BRIA RMBG-2.0 is released under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.
> - **Permitted**: Non-commercial research, academic evaluation, personal testing.
> - **Prohibited**: Commercial deployment, SaaS integration, enterprise educational LMS services without a direct commercial license agreement from BRIA AI.
> 
> In contrast:
> - **`u2net`** is distributed under the **Apache 2.0 License** (free for commercial and non-commercial use with attribution).
> - **`isnet-general-use`** is open for academic and open-source evaluation.
>
> **Default Recommendation**: Use `u2net` for commercial/unrestricted deployment; use `isnet-general-use` or licensed RMBG-2.0 where superior edge sharpness is mandated and licenses are cleared.

---

## 7. RunPod Serverless GPU Deployment Guide

### Files Provided:
- [`runpod_app.py`](./runpod_app.py): Serverless worker entrypoint compatible with RunPod Serverless handler interface.
- [`Dockerfile.runpod`](./Dockerfile.runpod): Pre-packaged container with Python 3.10, PyTorch, PyMatting, OpenCV, and pre-cached model weights.

### Step-by-Step Deployment:
1. **Build and push container image to Docker Hub / GitHub Container Registry (GHCR)**:
   ```bash
   docker build -t your-org/plp-math-worker:latest -f Dockerfile.runpod .
   docker push your-org/plp-math-worker:latest
   ```
2. **Create RunPod Serverless Endpoint**:
   - Go to [RunPod Console](https://runpod.io/console/serverless) -> **Serverless** -> **New Endpoint**.
   - Select GPU Tier (e.g. **NVIDIA RTX 4090 (24GB)** or **NVIDIA RTX A4000 (16GB)**).
   - Set Container Image: `your-org/plp-math-worker:latest`.
   - Set Container Disk: `10 GB`.
   - Set Idle Timeout: `5 seconds` (scales to zero rapidly when idle).
   - Set Environment Variables:
     - `REMBG_MODEL` = `u2net`
     - `MAX_UPLOAD_BYTES` = `15728640`
3. **Execute Job via HTTP**:
   ```bash
   curl -X POST "https://api.runpod.ai/v2/<YOUR_ENDPOINT_ID>/runsync" \
     -H "Authorization: Bearer <RUNPOD_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "input": {
         "image": "https://example.com/sample.png",
         "endpoint": "remove",
         "refine": true,
         "quality": "balanced"
       }
     }'
   ```

---

## 8. Deployment Guide for Standard Containers (Railway / Render / Fly.io / HF)

### Option 1: Railway / Render / Fly.io (Docker Service)
1. Push this repository or the `worker/` directory to GitHub.
2. In Railway/Render, create a new service from the Dockerfile in `worker/`.
3. Set environment variables:
   - `REMBG_MODEL=u2net`
   - `WORKER_AUTH_TOKEN=your_secure_random_token_here` (optional)
   - `ALLOWED_ORIGINS=https://ai-toolkit-hub-nu.vercel.app`
4. Deploy the service and copy the public HTTPS URL (e.g. `https://rembg-worker.up.railway.app`).

### Option 2: Hugging Face Spaces (Docker Space)
1. Create a new Space on Hugging Face and choose **Docker** SDK.
2. Push `Dockerfile`, `requirements.txt`, `main.py`, and `alpha_matting.py` to the Space repository.
3. Your endpoint will be `https://<space-name>.hf.space`.

---

## 9. Connecting to AI Toolkit Hub (Next.js)

### On Vercel:
1. Open your Vercel Project Dashboard -> **Settings** -> **Environment Variables**.
2. Add:
   - `BACKGROUND_REMOVAL_WORKER_URL` = `https://your-worker-url.com`
   - `BACKGROUND_REMOVAL_WORKER_TOKEN` = `your_token_if_configured`
   - `BACKGROUND_REMOVAL_TIMEOUT_MS` = `60000`
3. Trigger a **Redeploy** on Vercel.
4. Navigate to `/bg-remover` or `/plp-math-content` — the worker status will display `Ready`!

### In Local Development:
Add to `.env.local`:
```bash
BACKGROUND_REMOVAL_WORKER_URL=http://localhost:8000
# BACKGROUND_REMOVAL_WORKER_TOKEN=
```
