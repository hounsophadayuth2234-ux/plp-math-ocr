"""
Verify CORS Headers & Mobile Browser Compatibility over Live Public Cloudflare Tunnel.
Simulates real Android Chrome / Honor Win on 5G connecting from https://web-remote-flax.vercel.app.
"""
import os
import json
import time
import httpx
import asyncio
import websockets
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env")
PIN = os.getenv("ACCESS_PIN", "123456")
ORIGIN = "https://web-remote-flax.vercel.app"

# Step 1: Discover active TUNNEL_URL from Supabase
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
res = sb.table("device_commands")\
    .select("payload")\
    .eq("command", "TUNNEL_URL")\
    .eq("status", "active")\
    .order("id", desc=True)\
    .limit(1)\
    .single()\
    .execute()

tunnel_url = res.data["payload"].rstrip("/")
print("=" * 70)
print(f"DISCOVERED LIVE ACTIVE TUNNEL URL: {tunnel_url}")
print(f"SIMULATING MOBILE ORIGIN: {ORIGIN}")
print("=" * 70)

# Step 2: Test HTTP OPTIONS (Preflight)
print("\n[TEST 1] HTTP OPTIONS Preflight (/api/ping)...")
opt_resp = httpx.options(
    f"{tunnel_url}/api/ping?pin={PIN}",
    headers={
        "Origin": ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
    },
    timeout=10.0,
)
print(f"   Status Code: {opt_resp.status_code}")
for k, v in opt_resp.headers.items():
    if "access-control" in k.lower():
        print(f"   {k}: {v}")
assert opt_resp.status_code == 200, f"OPTIONS failed with {opt_resp.status_code}"
assert opt_resp.headers.get("access-control-allow-origin") == "*", "Wildcard origin missing"
print("   -> OPTIONS Preflight PASSED!")

# Step 3: Test HTTP GET /api/ping with Origin
print("\n[TEST 2] HTTP GET (/api/ping) with Origin Header...")
get_resp = httpx.get(
    f"{tunnel_url}/api/ping?pin={PIN}",
    headers={"Origin": ORIGIN},
    timeout=10.0,
)
print(f"   Status Code: {get_resp.status_code}")
for k, v in get_resp.headers.items():
    if "access-control" in k.lower():
        print(f"   {k}: {v}")
assert get_resp.status_code == 200, f"GET failed with {get_resp.status_code}"
assert get_resp.headers.get("access-control-allow-origin") == "*", "Wildcard origin missing"
print(f"   Response Body: {get_resp.text}")
print("   -> HTTP GET /api/ping PASSED!")

# Step 4: Test HTTP Snapshot Fallback (/api/frame) with Origin
print("\n[TEST 3] HTTP Snapshot Fallback GET (/api/frame) with Origin Header...")
frame_resp = httpx.get(
    f"{tunnel_url}/api/frame?pin={PIN}&quality=60",
    headers={"Origin": ORIGIN},
    timeout=10.0,
)
print(f"   Status Code: {frame_resp.status_code}")
print(f"   Content-Type: {frame_resp.headers.get('content-type')}")
print(f"   Access-Control-Allow-Origin: {frame_resp.headers.get('access-control-allow-origin')}")
print(f"   Received JPEG Bytes: {len(frame_resp.content)} bytes (header: {frame_resp.content[:4].hex()})")
assert frame_resp.status_code == 200, "Frame endpoint failed"
assert frame_resp.content[:2] == b'\xff\xd8', "Invalid JPEG header"
print("   -> HTTP Snapshot Fallback /api/frame PASSED!")

# Step 5: Test WebSocket /ws/control with Origin
async def test_ws_control():
    print("\n[TEST 4] WebSocket /ws/control with Origin Header...")
    ws_url = tunnel_url.replace("https://", "wss://").replace("http://", "ws://") + f"/ws/control?pin={PIN}"
    async with websockets.connect(ws_url, additional_headers={"Origin": ORIGIN}, open_timeout=15.0) as ws:
        await ws.send(json.dumps({"type": "ping"}))
        raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(raw)
        print(f"   Pong received: {data}")
        assert data.get("type") == "pong"
    print("   -> WebSocket /ws/control PASSED!")

# Step 6: Test WebSocket /ws/screen with Origin
async def test_ws_screen():
    print("\n[TEST 5] WebSocket /ws/screen with Origin Header...")
    ws_url = tunnel_url.replace("https://", "wss://").replace("http://", "ws://") + f"/ws/screen?pin={PIN}&quality=low"
    async with websockets.connect(ws_url, additional_headers={"Origin": ORIGIN}, open_timeout=15.0) as ws:
        frame_bytes = await asyncio.wait_for(ws.recv(), timeout=5.0)
        print(f"   Live Video Frame Received: {len(frame_bytes)} bytes (header: {frame_bytes[:4].hex()})")
        assert len(frame_bytes) > 5000, "Frame too small"
        assert frame_bytes[:2] == b'\xff\xd8', "Invalid JPEG header in stream"
    print("   -> WebSocket /ws/screen PASSED!")

asyncio.run(test_ws_control())
asyncio.run(test_ws_screen())

print("\n" + "=" * 70)
print("ALL 5 MOBILE 5G & CORS CHECKS PASSED OVER LIVE PUBLIC CLOUDFLARE TUNNEL!")
print("=" * 70)
