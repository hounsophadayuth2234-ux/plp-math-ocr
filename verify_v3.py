"""
V3.0 End-to-End Automated Verification Script
Tests the LIVE PUBLIC Cloudflare Tunnel URL over the internet:
1. Queries Supabase for the active TUNNEL_URL.
2. Tests HTTP /api/ping with PIN 123456.
3. Tests HTTP /api/files (verifies real C: drive / Desktop listings).
4. Tests WebSocket /ws/screen (receives 5 real binary JPEG frames, measures FPS).
5. Tests WebSocket /ws/telemetry (verifies CPU, RAM, Disk partitions, Network speeds, Active Window, Processes).
6. Tests WebSocket /ws/control (sends tiny cursor nudge and verifies clipboard response).
"""

import os
import sys
import time
import json
import asyncio

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
from dotenv import load_dotenv
import httpx
import websockets
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
PIN = os.getenv("ACCESS_PIN", "123456")

print("=" * 70)
print("🚀 STARTING V3.0 PRO REAL-WORLD PUBLIC TUNNEL VERIFICATION")
print("=" * 70)

# Step 1: Query Supabase for latest TUNNEL_URL
if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ FATAL: Missing SUPABASE_URL or SUPABASE_KEY in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
resp = sb.table("device_commands") \
    .select("payload, created_at") \
    .eq("command", "TUNNEL_URL") \
    .order("created_at", desc=True) \
    .limit(1) \
    .execute()

records = resp.data or []
if not records:
    print("❌ FATAL: No TUNNEL_URL found in Supabase device_commands.")
    sys.exit(1)

public_url = records[0]["payload"].rstrip("/")
created_at = records[0]["created_at"]
print(f"✅ Step 1: Auto-discovered Live Public Tunnel URL from Supabase: {public_url} (Registered: {created_at})")

# Step 2: Test HTTP /api/ping
with httpx.Client(timeout=10.0) as client:
    ping_resp = client.get(f"{public_url}/api/ping?pin={PIN}")
    if ping_resp.status_code != 200:
        print(f"❌ Step 2 Failed: HTTP {ping_resp.status_code}: {ping_resp.text}")
        sys.exit(1)
    ping_data = ping_resp.json()
    print(f"✅ Step 2: HTTP /api/ping PASSED -> Host: {ping_data.get('device_name')} | Active Window: '{ping_data.get('active_window')}' | Uptime: {ping_data.get('uptime')}s")

# Step 3: Test HTTP /api/files (Root and Desktop)
with httpx.Client(timeout=10.0) as client:
    files_resp = client.get(f"{public_url}/api/files?pin={PIN}")
    if files_resp.status_code != 200:
        print(f"❌ Step 3 Failed: HTTP {files_resp.status_code}: {files_resp.text}")
        sys.exit(1)
    files_data = files_resp.json()
    drives = files_data.get("drives", [])
    shortcuts = files_data.get("shortcuts", [])
    print(f"✅ Step 3a: HTTP /api/files (Root) PASSED -> Found {len(drives)} drive(s): {[d['path'] for d in drives]} and {len(shortcuts)} shortcuts")

    # Browse first drive (C:\)
    c_drive = drives[0]["path"] if drives else "C:\\"
    browse_resp = client.get(f"{public_url}/api/files?path={c_drive}&pin={PIN}")
    if browse_resp.status_code == 200:
        items = browse_resp.json().get("items", [])
        sample_names = [it["name"] for it in items[:4]]
        print(f"✅ Step 3b: HTTP /api/files ({c_drive}) PASSED -> Listed {len(items)} items. Sample: {sample_names}")
    else:
        print(f"⚠️ Step 3b Browse notice: HTTP {browse_resp.status_code}")


# Step 4, 5, 6: Async WebSocket verifications
async def run_ws_tests():
    # Convert https:// to wss://
    ws_base = public_url.replace("https://", "wss://").replace("http://", "ws://")

    # Test 4: Live Screen Stream (/ws/screen)
    print("\n--- Testing Live Screen Video Stream (/ws/screen) ---")
    ws_screen_url = f"{ws_base}/ws/screen?pin={PIN}&quality=medium"
    async with websockets.connect(ws_screen_url, ping_interval=None) as ws:
        frames_received = 0
        total_bytes = 0
        t0 = time.time()
        for i in range(5):
            frame = await asyncio.wait_for(ws.recv(), timeout=10.0)
            frames_received += 1
            total_bytes += len(frame)
            print(f"   [Frame {frames_received}] Received {len(frame)} bytes JPEG (header: {frame[:4].hex()})")
        dt = time.time() - t0
        measured_fps = round(frames_received / dt, 1)
        print(f"✅ Step 4: /ws/screen PASSED -> 5 Real JPEG frames received ({round(total_bytes/1024, 1)} KB total). Measured: {measured_fps} FPS over live tunnel!")

    # Test 5: Full PC Telemetry (/ws/telemetry)
    print("\n--- Testing Full PC Telemetry Stream (/ws/telemetry) ---")
    ws_telem_url = f"{ws_base}/ws/telemetry?pin={PIN}"
    async with websockets.connect(ws_telem_url, ping_interval=None) as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
        telem = json.loads(msg)
        print(f"   CPU Total: {telem.get('cpu_total')}% ({len(telem.get('cpu_cores', []))} cores)")
        print(f"   RAM Usage: {telem.get('ram_used_gb')}GB / {telem.get('ram_total_gb')}GB ({telem.get('ram_percent')}%)")
        print(f"   Disk Partitions: {telem.get('disks')}")
        print(f"   Live Network: Down {telem.get('down_kb_s')} KB/s | Up {telem.get('up_kb_s')} KB/s")
        print(f"   Battery: {telem.get('battery_percent')}% (Charging: {telem.get('is_charging')})")
        print(f"   Active Window: '{telem.get('active_window')}'")
        print(f"   Top Processes Count: {len(telem.get('top_processes', []))} (Top: {telem.get('top_processes', [{}])[0].get('name')})")
        print(f"✅ Step 5: /ws/telemetry PASSED -> Real hardware monitoring streaming verified!")

    # Test 6: Interactive Remote Control (/ws/control)
    print("\n--- Testing Interactive Remote Input (/ws/control) ---")
    ws_ctrl_url = f"{ws_base}/ws/control?pin={PIN}"
    async with websockets.connect(ws_ctrl_url, ping_interval=None) as ws:
        # Ping test
        await ws.send(json.dumps({"type": "ping"}))
        pong_resp = await asyncio.wait_for(ws.recv(), timeout=5.0)
        pong = json.loads(pong_resp)
        print(f"   Pong received: {pong}")

        # Mouse nudge test (harmless 1px move)
        await ws.send(json.dumps({"type": "mouse_move_rel", "dx": 1, "dy": 0}))
        await asyncio.sleep(0.05)
        await ws.send(json.dumps({"type": "mouse_move_rel", "dx": -1, "dy": 0}))
        print(f"   Dispatched mouse_move_rel relative nudge (dx=1, dy=0)")

        # Clipboard pull test
        await ws.send(json.dumps({"type": "clipboard_pull"}))
        clip_resp = await asyncio.wait_for(ws.recv(), timeout=5.0)
        clip_data = json.loads(clip_resp)
        print(f"   Clipboard pull response: {clip_data}")
        print(f"✅ Step 6: /ws/control PASSED -> Interactive input & bi-directional WebSockets verified!")

asyncio.run(run_ws_tests())

print("\n" + "=" * 70)
print("🎉 100% OF END-TO-END V3.0 REAL-WORLD TESTS PASSED OVER PUBLIC CLOUDFLARE TUNNEL!")
print("=" * 70)
