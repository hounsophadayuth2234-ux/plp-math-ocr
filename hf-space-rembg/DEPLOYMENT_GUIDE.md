# 🚀 How to Deploy the Free Pure FastAPI Rembg Space in 2 Minutes

This guide walks you through hosting your own 100% free pure FastAPI background removal microservice on Hugging Face Spaces with **zero credit card**, **zero subscription fees**, and **unlimited usage**.

---

### Step 1: Create a Free Hugging Face Account
1. Go to [huggingface.co](https://huggingface.co) and sign up (Free).

---

### Step 2: Create a New Space
1. Click your profile avatar on Hugging Face (top right) → **New Space** (or visit [huggingface.co/new-space](https://huggingface.co/new-space)).
2. Configure your Space:
   - **Space Name**: `plp-rembg` (or any name you like)
   - **License**: `mit`
   - **Space SDK**: Select **Docker** (Blank)
   - **Space Hardware**: **CPU basic · 2 vCPU · 16 GB · Free**
   - **Visibility**: **Public** (recommended for simplest connection)
3. Click **Create Space**.

---

### Step 3: Upload the Microservice Files
You can upload the files directly in the browser via the Hugging Face web interface:
1. Click the **Files** tab in your newly created Space.
2. Click **Add file** → **Upload files**.
3. Upload the 4 files from the `hf-space-rembg/` folder in your project:
   - `app.py`
   - `requirements.txt`
   - `Dockerfile`
   - `README.md`
4. Click **Commit changes to main**.
5. Hugging Face will automatically build and launch the container in ~1-2 minutes!
6. Once the status says **Running**, you can test the interactive OpenAPI docs by opening your Space URL in the browser (e.g. `https://<your-username>-<your-space-name>.hf.space/docs`).

---

### Step 4: Get Your Space URL
Your Space URL follows this standard format:
```
https://<your-username>-<your-space-name>.hf.space
```
*(Example: `https://myuser-plp-rembg.hf.space`)*

You can also find this URL by clicking the three dots `...` in the top right of your Space → **Embed this Space** → copy the **Direct URL**.

---

### Step 5: Connect It to Your Next.js App
Add the Space URL to your Next.js project:

#### Option A: In the Web UI (Easiest)
1. Open your live app dashboard at [https://ai-toolkit-hub-nu.vercel.app](https://ai-toolkit-hub-nu.vercel.app).
2. Click the **⚙️ Settings** icon in the header.
3. Paste your URL into **Python Rembg Space URL**:
   `https://<your-username>-<your-space-name>.hf.space`
4. Click **Save Settings**.

#### Option B: In Vercel Environment Variables (For Production)
1. Go to your [Vercel Dashboard](https://vercel.com).
2. Open your project → **Settings** → **Environment Variables**.
3. Add a new variable:
   - Key: `REMBG_SPACE_URL`
   - Value: `https://<your-username>-<your-space-name>.hf.space`
4. Click **Save**.
