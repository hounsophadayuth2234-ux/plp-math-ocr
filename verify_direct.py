"""
verify_direct.py
End-to-end automated verification script for Dell Latitude 7490 V3.0 PRO Direct Streaming Server.
Tests HTTP endpoints, self-hosted static Web Remote SPA, and WebSockets on both Localhost and LAN IP.
"""

import sys
import time
import json
import urllib.request
import urllib.error
import websockets
import asyncio

PIN = "123456"
LOCAL_URL = "http://127.0.0.1:8765"
LAN_URL = "http://10.75.33.100:8765"

def test_http_endpoint(url: str, description: str, expected_type: str = "json") -> bool:
    print(f"[*] Testing {description}: {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "VerifyScript/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            content_type = response.headers.get("Content-Type", "")
            body = response.read()
            print(f"    [+] Status: {status}, Content-Type: {content_type}, Size: {len(body)} bytes")
            if status != 200:
                print(f"    [-] FAILED: Unexpected status {status}")
                return False
            if expected_type == "json":
                parsed = json.loads(body.decode("utf-8"))
                print(f"    [+] JSON Response: {parsed}")
            elif expected_type == "html":
                sample = body[:120].decode("utf-8", errors="replace").replace("\n", " ")
                print(f"    [+] HTML Head: {sample}...")
            elif expected_type == "image":
                print(f"    [+] Image verified: {len(body)} bytes JPEG received.")
            return True
    except Exception as e:
        print(f"    [-] FAILED: {e}")
        return False

async def test_control_websocket(host_port: str):
    ws_url = f"ws://{host_port}/ws/control?pin={PIN}"
    print(f"[*] Testing WebSocket Control Channel: {ws_url}")
    try:
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            # Send ping action (server expects {"type": "ping"})
            ping_msg = json.dumps({"type": "ping"})
            await ws.send(ping_msg)
            print("    [+] Sent: {\"type\": \"ping\"}")
            
            # Receive pong reply
            reply = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f"    [+] Received reply: {reply[:100]}...")
            parsed = json.loads(reply)
            if parsed.get("type") == "pong":
                print(f"    [+] Valid pong confirmed: active_window='{parsed.get('active_window')}'")
                return True
            return False
    except Exception as e:
        print(f"    [-] WS Control FAILED: {type(e).__name__} - {e}")
        return False

async def test_screen_websocket(host_port: str):
    ws_url = f"ws://{host_port}/ws/screen?pin={PIN}&fps=10&quality=50&width=960"
    print(f"[*] Testing WebSocket Screen Channel: {ws_url}")
    try:
        async with websockets.connect(ws_url, open_timeout=5) as ws:
            frame = await asyncio.wait_for(ws.recv(), timeout=5)
            if isinstance(frame, bytes):
                print(f"    [+] Received binary screen frame: {len(frame)} bytes JPEG.")
                # Verify JPEG SOI marker (0xFF, 0xD8)
                if len(frame) > 2 and frame[0] == 0xFF and frame[1] == 0xD8:
                    print("    [+] Valid JPEG Header verified!")
                    return True
                else:
                    print("    [-] Invalid JPEG header.")
                    return False
            else:
                print(f"    [+] Received text frame: {frame[:80]}")
                return True
    except Exception as e:
        print(f"    [-] WS Screen FAILED: {e}")
        return False

async def run_all():
    print("=" * 65)
    print("RUNNING END-TO-END DIRECT CONNECTION VERIFICATION")
    print("=" * 65)

    results = []

    # 1. Test Localhost Root SPA
    results.append(("Localhost SPA (/) ", test_http_endpoint(f"{LOCAL_URL}/", "Localhost SPA Root", "html")))

    # 2. Test Localhost Ping
    results.append(("Localhost Ping (/api/ping) ", test_http_endpoint(f"{LOCAL_URL}/api/ping?pin={PIN}", "Localhost Ping API", "json")))

    # 3. Test Localhost Snapshot Frame
    results.append(("Localhost Frame (/api/frame) ", test_http_endpoint(f"{LOCAL_URL}/api/frame?pin={PIN}", "Localhost Snapshot API", "image")))

    # 4. Test LAN IP Root SPA
    results.append(("LAN SPA (/) ", test_http_endpoint(f"{LAN_URL}/", "LAN SPA Root", "html")))

    # 5. Test LAN Ping
    results.append(("LAN Ping (/api/ping) ", test_http_endpoint(f"{LAN_URL}/api/ping?pin={PIN}", "LAN Ping API", "json")))

    # 6. Test LAN Snapshot Frame
    results.append(("LAN Frame (/api/frame) ", test_http_endpoint(f"{LAN_URL}/api/frame?pin={PIN}", "LAN Snapshot API", "image")))

    # 7. Test WS Control
    results.append(("WS Control (127.0.0.1) ", await test_control_websocket("127.0.0.1:8765")))

    # 8. Test WS Screen
    results.append(("WS Screen (127.0.0.1) ", await test_screen_websocket("127.0.0.1:8765")))

    # 9. Test WS Control LAN
    results.append(("WS Control (LAN) ", await test_control_websocket("10.75.33.100:8765")))

    # 10. Test WS Screen LAN
    results.append(("WS Screen (LAN) ", await test_screen_websocket("10.75.33.100:8765")))

    print("\n" + "=" * 65)
    print("VERIFICATION SUMMARY:")
    all_ok = True
    for name, success in results:
        status_text = "PASS [OK]" if success else "FAIL [X]"
        if not success:
            all_ok = False
        print(f" - {name:<35}: {status_text}")
    print("=" * 65)
    if all_ok:
        print("[SUCCESS] All direct HTTP and WebSocket tests PASSED 100%!")
        sys.exit(0)
    else:
        print("[FAILURE] Some tests failed.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_all())
