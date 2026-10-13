# 🚀 How to Deploy the Free Rembg Hugging Face Space in 2 Minutes

This guide walks you through hosting your own 100% free background removal microservice on Hugging Face Spaces with **zero credit card**, **zero subscription fees**, and **unlimited usage**.

---

### Step 1: Create a Free Hugging Face Account
1. Go to [huggingface.co](https://huggingface.co) and sign up (Free).

---

### Step 2: Create a New Space
1. Click your profile avatar on Hugging Face (top right) → **New Space** (or visit [huggingface.co/new-space](https://huggingface.co/new-space)).
2. Configure your Space:
   - **Space Name**: `plp-rembg` (or any name you like)
   - **License**: `mit`
   - **Space SDK**: Select **Gradio** (recommended) or **Docker**
   - **Space Hardware**: **CPU basic · 2 vCPU · 16 GB · Free**
   - **Visibility**: **Public** (recommended for simplest connection, or Private if you add a HF Token)
3. Click **Create Space**.

---

### Step 3: Upload the Microservice Files
You can upload the files directly in the browser via the Hugging Face web interface:
1. Click the **Files** tab in your newly created Space.
2. Click **Add file** → **Upload files**.
3. Upload the files from the `hf-space-rembg/` folder:
   - `app.py`
   - `requirements.txt`
   - `README.md`
4. Commit the changes.
5. Hugging Face will automatically build and launch the container in ~1-2 minutes!
6. Once the status says **Running**, test it by uploading an image in the Space UI.

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
1. Open your live app dashboard.
2. Click the **⚙️ Settings** icon in the header.
3. Paste your URL into **Hugging Face Rembg Space URL**:
   `https://<your-username>-<your-space-name>.hf.space`
4. Click **Save Settings**.

#### Option B: In Vercel Environment Variables (For Production)
1. Go to your [Vercel Dashboard](https://vercel.com).
2. Open your project → **Settings** → **Environment Variables**.
3. Add a new variable:
   - Key: `REMBG_SPACE_URL`
   - Value: `https://<your-username>-<your-space-name>.hf.space`
4. Click **Save**.
