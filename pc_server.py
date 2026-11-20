"""
Cross-Device Remote Desktop System - PC Server V3.0 PRO (Windows 10/11)
Dell Latitude 7490 Automation & Live Streaming Backend

Engineered to run as a 100% independent Windows Service / Scheduled Task
- Survives Antigravity IDE closures, Chrome closures, and Windows restarts.
- Compatible with pythonw.exe (zero black console window, file logging fallback).
- Built-in Cloudflare Tunnel Watchdog: auto-starts, auto-restarts on crash or network loss,
  and automatically publishes new public URL to Supabase 'device_commands'.
- Real-time Screen Video Stream (/ws/screen) using mss/Pillow at 10-18 FPS.
- Interactive Touch & Precision Remote Input (/ws/control) with <100ms latency.
- Full PC Telemetry Streaming (/ws/telemetry) every 2s: CPU, RAM, Disk (C:, D:),
  live Network Down/Up speeds, Battery, Uptime, Active Window Title, and Top 20 Processes.
- Remote File Explorer (/api/files, /api/download, /api/open-file).
- PIN Security on all HTTP and WebSocket endpoints (default: 123456).
"""

import os
import sys
import time
import io
import re
import json
import ctypes
import shutil
import logging
import asyncio
import threading
import subprocess
import urllib.request
import webbrowser
from typing import Optional, Dict, Any, List
from pathlib import Path

# Always guarantee working directory is the script directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

# Handle pythonw.exe execution where stdout/stderr are None
log_file = os.path.join(BASE_DIR, "pc_server.log")
if sys.stdout is None:
    try:
        sys.stdout = open(log_file, "a", encoding="utf-8", buffering=1)
    except Exception:
        sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    try:
        sys.stderr = open(log_file, "a", encoding="utf-8", buffering=1)
    except Exception:
        sys.stderr = open(os.devnull, "w")

from dotenv import load_dotenv

handlers: List[logging.Handler] = [
    logging.FileHandler(log_file, encoding="utf-8"),
    logging.StreamHandler(sys.stdout)
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=handlers
)
logger = logging.getLogger("pc_server_v3")

# DPI Awareness (Crucial for 100% accurate coordinates on Windows display scaling)
if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        logger.info("Per-Monitor DPI awareness enabled (Mode 2).")
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
            logger.info("Process DPI awareness enabled (Fallback).")
        except Exception as e:
            logger.warning(f"Could not enable DPI awareness: {e}")

# Load dependencies
import psutil
import pyperclip
from PIL import Image
import pyautogui
import mss
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
import uvicorn
from supabase import create_client, Client

# Ultra-low latency settings for pyautogui
pyautogui.PAUSE = 0.0
pyautogui.FAILSAFE = False

# Load environment variables
load_dotenv(os.path.join(BASE_DIR, ".env"))

ACCESS_PIN = os.getenv("ACCESS_PIN", "123456")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DEVICE_ID = int(os.getenv("DEVICE_ID", "1"))
DEVICE_NAME = os.getenv("DEVICE_NAME", "Dell Latitude 7490")
SERVER_PORT = int(os.getenv("PORT", "8765"))
SERVER_HOST = os.getenv("HOST", "127.0.0.1")

# Global state
current_tunnel_url: Optional[str] = None
tunnel_process: Optional[subprocess.Popen] = None
server_running = True
supabase_client: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.warning(f"Could not initialize Supabase client: {e}")


def ensure_desktop_attached():
    """Ensure the calling thread is attached to the active Windows input desktop."""
    if sys.platform == "win32":
        try:
            user32 = ctypes.windll.user32
            hDesk = user32.OpenInputDesktop(0, False, 0x01FF)
            if hDesk:
                user32.SetThreadDesktop(hDesk)
                user32.CloseDesktop(hDesk)
        except Exception:
            pass


def get_screen_resolution() -> tuple[int, int]:
    """Return primary display resolution width and height."""
    try:
        w, h = pyautogui.size()
        return int(w), int(h)
    except Exception:
        user32 = ctypes.windll.user32
        return int(user32.GetSystemMetrics(0)), int(user32.GetSystemMetrics(1))


def get_active_window_title() -> str:
    """Return title of current foreground window."""
    if sys.platform != "win32":
        return "N/A"
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            return buf.value.strip() or "Desktop / Background"
        return "Desktop / Background"
    except Exception:
        return "Desktop / Background"


# =============================================================================
# FASTAPI APP & SECURITY
# =============================================================================

app = FastAPI(title="Dell Remote Server V3.0 PRO", version="3.0.0")

# Mobile 5G & Cross-Origin Safe CORS Configuration (allow_credentials=False for wildcard origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_http_pin(
    pin: Optional[str] = Query(None),
    x_access_pin: Optional[str] = Header(None, alias="X-Access-Pin")
) -> bool:
    """Verify PIN for HTTP endpoints."""
    provided = pin or x_access_pin
    if not provided or provided != ACCESS_PIN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid access PIN."
        )
    return True


@app.get("/api/frame")
async def api_frame(
    authenticated: bool = Depends(verify_http_pin),
    quality: int = Query(60),
    width: int = Query(960)
):
    """
    HTTP Single-Frame JPEG Snapshot Fallback.
    Used when mobile 5G or carrier networks throttle or block WebSockets.
    """
    ensure_desktop_attached()
    try:
        def capture_jpeg():
            with mss.mss() as sct:
                monitor = sct.monitors[1]
                raw = sct.grab(monitor)
                img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
                orig_w, orig_h = img.size
                if orig_w > width:
                    target_h = int(width * orig_h / orig_w)
                    img = img.resize((width, target_h), Image.Resampling.BILINEAR)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=max(20, min(95, quality)), optimize=False)
                return buf.getvalue()

        frame_bytes = await asyncio.to_thread(capture_jpeg)
        return Response(
            content=frame_bytes,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Access-Control-Allow-Origin": "*",
            }
        )
    except Exception as e:
        logger.warning(f"Frame snapshot capture error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# 1. LIVE SCREEN STREAMING WEBSOCKET (/ws/screen)
# =============================================================================

QUALITY_PRESETS = {
    "low": {"width": 640, "quality": 45, "fps": 10},
    "medium": {"width": 960, "quality": 55, "fps": 12},
    "high": {"width": 1280, "quality": 65, "fps": 15},
    "native": {"width": 1920, "quality": 75, "fps": 15},
}


@app.websocket("/ws/screen")
async def websocket_screen_stream(
    websocket: WebSocket,
    pin: Optional[str] = Query(None),
    quality: str = Query("medium")
):
    if pin != ACCESS_PIN:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid access PIN")
        return

    await websocket.accept()
    logger.info("Screen stream WebSocket connected.")

    current_preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["medium"]).copy()

    async def listen_client_commands():
        nonlocal current_preset
        try:
            while True:
                msg_text = await websocket.receive_text()
                try:
                    data = json.loads(msg_text)
                    if data.get("action") == "set_preset":
                        p_name = data.get("preset", "medium")
                        if p_name in QUALITY_PRESETS:
                            current_preset.update(QUALITY_PRESETS[p_name])
                            if "fps" in data:
                                current_preset["fps"] = int(data["fps"])
                            logger.info(f"Screen stream updated to preset: {p_name} ({current_preset})")
                    elif data.get("action") == "set_fps":
                        current_preset["fps"] = max(5, min(30, int(data.get("fps", 12))))
                except Exception as e:
                    logger.debug(f"Screen ws client message parse error: {e}")
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    listener_task = asyncio.create_task(listen_client_commands())

    try:
        ensure_desktop_attached()
        with mss.MSS() as sct:
            monitor = sct.monitors[1]  # Primary monitor

            while True:
                t_start = time.time()
                target_w = current_preset["width"]
                q = current_preset["quality"]
                fps = current_preset["fps"]

                try:
                    ensure_desktop_attached()
                    raw = sct.grab(monitor)
                    img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")

                    # Resize maintaining aspect ratio
                    orig_w, orig_h = img.size
                    if orig_w > target_w:
                        target_h = int(target_w * orig_h / orig_w)
                        img = img.resize((target_w, target_h), Image.Resampling.BILINEAR)

                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=q, optimize=False)
                    frame_bytes = buf.getvalue()

                    await websocket.send_bytes(frame_bytes)

                except Exception as grab_err:
                    logger.debug(f"Frame capture error: {grab_err}")
                    await asyncio.sleep(0.1)

                elapsed = time.time() - t_start
                target_delay = 1.0 / max(1, fps)
                sleep_time = max(0.005, target_delay - elapsed)
                await asyncio.sleep(sleep_time)

    except WebSocketDisconnect:
        logger.info("Screen stream WebSocket disconnected cleanly.")
    except Exception as e:
        logger.debug(f"Screen stream WebSocket error: {e}")
    finally:
        listener_task.cancel()


# =============================================================================
# 2. REAL-TIME INTERACTIVE INPUT & CONTROL WEBSOCKET (/ws/control)
# =============================================================================

@app.websocket("/ws/control")
async def websocket_control(websocket: WebSocket, pin: Optional[str] = Query(None)):
    if pin != ACCESS_PIN:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid access PIN")
        return

    await websocket.accept()
    logger.info("Control WebSocket connected.")

    screen_w, screen_h = get_screen_resolution()

    try:
        while True:
            msg_text = await websocket.receive_text()
            data = json.loads(msg_text)
            action_type = data.get("type", "").lower()

            if action_type == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "time": time.time(),
                    "active_window": get_active_window_title()
                }))
                continue

            # Direct Touch Screen Actions (Ratio Mapped)
            if action_type in ("tap", "double_tap", "right_click", "mouse_down", "mouse_move_abs", "mouse_up"):
                xr = float(data.get("x_ratio", 0.0))
                yr = float(data.get("y_ratio", 0.0))
                target_x = int(screen_w * max(0.0, min(1.0, xr)))
                target_y = int(screen_h * max(0.0, min(1.0, yr)))

                if action_type == "tap":
                    pyautogui.click(target_x, target_y)
                elif action_type == "double_tap":
                    pyautogui.doubleClick(target_x, target_y)
                elif action_type == "right_click":
                    pyautogui.rightClick(target_x, target_y)
                elif action_type == "mouse_down":
                    pyautogui.mouseDown(target_x, target_y)
                elif action_type == "mouse_move_abs":
                    pyautogui.moveTo(target_x, target_y, _pause=False)
                elif action_type == "mouse_up":
                    pyautogui.mouseUp(target_x, target_y)

            # Precision Trackpad Relative Mode
            elif action_type == "mouse_move_rel":
                dx = int(data.get("dx", 0))
                dy = int(data.get("dy", 0))
                pyautogui.moveRel(dx, dy, _pause=False)

            elif action_type == "scroll":
                dy = int(data.get("dy", 0))
                pyautogui.scroll(dy)

            # Keyboard Typing (Supports full Unicode & Khmer)
            elif action_type == "type_text":
                text = str(data.get("text", ""))
                if text:
                    if any(ord(c) > 127 for c in text):
                        pyperclip.copy(text)
                        time.sleep(0.02)
                        pyautogui.hotkey('ctrl', 'v')
                    else:
                        pyautogui.write(text, interval=0.005)

            # Special Keys & Hotkeys
            elif action_type == "key_press":
                key = str(data.get("key", "")).lower()
                key_map = {"win": "winleft", "cmd": "winleft", "esc": "esc", "enter": "enter", "backspace": "backspace"}
                pyautogui.press(key_map.get(key, key))

            elif action_type == "hotkey":
                combo = str(data.get("combo", "")).lower()
                parts = [p.strip() for p in combo.split("+") if p.strip()]
                key_map = {"win": "winleft", "cmd": "winleft"}
                mapped = [key_map.get(p, p) for p in parts]
                if mapped:
                    pyautogui.hotkey(*mapped)

            # App Launcher
            elif action_type == "app_launch":
                app_target = str(data.get("app", "")).lower()
                custom = data.get("custom")
                if app_target == "chrome":
                    os.system("start chrome")
                elif app_target == "youtube":
                    webbrowser.open("https://youtube.com")
                elif app_target == "explorer":
                    os.system("start explorer.exe")
                elif app_target == "taskmgr":
                    os.system("start taskmgr.exe")
                elif app_target == "notepad":
                    os.system("start notepad.exe")
                elif app_target == "calc":
                    os.system("start calc.exe")
                elif app_target in ("vscode", "ide"):
                    os.system("start code")
                elif app_target == "custom" and custom:
                    c = str(custom).strip()
                    if c.startswith(("http://", "https://")):
                        webbrowser.open(c)
                    else:
                        os.system(f'start "" "{c}"')

            # Hardware Audio & Brightness
            elif action_type == "set_volume":
                vol = int(data.get("volume", 50))
                try:
                    from pycaw.pycaw import AudioUtilities
                    spk = AudioUtilities.GetSpeakers()
                    if spk and hasattr(spk, 'EndpointVolume'):
                        scalar = max(0.0, min(1.0, float(vol) / 100.0))
                        spk.EndpointVolume.SetMasterVolumeLevelScalar(scalar, None)
                        if scalar > 0 and spk.EndpointVolume.GetMute():
                            spk.EndpointVolume.SetMute(0, None)
                except Exception as e:
                    logger.warning(f"Set volume error: {e}")

            elif action_type == "toggle_mute":
                try:
                    from pycaw.pycaw import AudioUtilities
                    spk = AudioUtilities.GetSpeakers()
                    if spk and hasattr(spk, 'EndpointVolume'):
                        is_m = spk.EndpointVolume.GetMute()
                        spk.EndpointVolume.SetMute(0 if is_m else 1, None)
                except Exception:
                    pyautogui.press("volumemute")

            elif action_type == "set_brightness":
                bri = int(data.get("brightness", 70))
                try:
                    import screen_brightness_control as sbc
                    sbc.set_brightness(max(0, min(100, bri)))
                except Exception as e:
                    logger.warning(f"Set brightness error: {e}")

            elif action_type == "media_key":
                action = str(data.get("action", "")).lower()
                if action == "playpause":
                    pyautogui.press("playpause")
                elif action == "next":
                    pyautogui.press("nexttrack")
                elif action == "prev":
                    pyautogui.press("prevtrack")

            # Display & Power
            elif action_type == "screen_off":
                ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, 2)

            elif action_type == "wake_screen":
                pyautogui.moveRel(1, 0, _pause=False)
                pyautogui.moveRel(-1, 0, _pause=False)
                ctypes.windll.user32.mouse_event(1, 0, 0, 0, 0)

            elif action_type == "boss_key":
                try:
                    from pycaw.pycaw import AudioUtilities
                    spk = AudioUtilities.GetSpeakers()
                    if spk and hasattr(spk, 'EndpointVolume'):
                        spk.EndpointVolume.SetMute(1, None)
                except Exception:
                    pyautogui.press("volumemute")
                pyautogui.hotkey('win', 'd')

            elif action_type == "lock":
                ctypes.windll.user32.LockWorkStation()

            elif action_type == "sleep":
                try:
                    ctypes.windll.powrprof.SetSuspendState(0, 1, 0)
                except Exception:
                    os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")

            elif action_type == "restart":
                os.system('shutdown /r /t 5 /c "Restart initiated remotely"')

            elif action_type == "shutdown":
                os.system('shutdown /s /t 5 /c "Shutdown initiated remotely"')

            # Clipboard
            elif action_type == "clipboard_push":
                clip_text = str(data.get("text", ""))
                pyperclip.copy(clip_text)

            elif action_type == "clipboard_pull":
                current_clip = pyperclip.paste() or ""
                await websocket.send_text(json.dumps({
                    "type": "clipboard_data",
                    "text": current_clip
                }))

    except WebSocketDisconnect:
        logger.info("Control WebSocket disconnected.")
    except Exception as e:
        logger.debug(f"Control WebSocket error: {e}")


# =============================================================================
# 3. FULL PC TELEMETRY WEBSOCKET (/ws/telemetry)
# =============================================================================

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket, pin: Optional[str] = Query(None)):
    if pin != ACCESS_PIN:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid access PIN")
        return

    await websocket.accept()
    logger.info("Telemetry WebSocket connected.")

    last_net = psutil.net_io_counters()
    last_time = time.time()
    psutil.cpu_percent(interval=None)

    try:
        while True:
            await asyncio.sleep(2.0)
            now_time = time.time()
            dt = max(0.1, now_time - last_time)

            # CPU
            cpu_total = psutil.cpu_percent(interval=None)
            cpu_cores = psutil.cpu_percent(interval=None, percpu=True)

            # RAM
            vm = psutil.virtual_memory()
            ram_total_gb = round(vm.total / (1024**3), 1)
            ram_used_gb = round(vm.used / (1024**3), 1)
            ram_percent = vm.percent

            # Disk Partitions (C:, D:, etc.)
            disks = []
            for p in psutil.disk_partitions(all=False):
                try:
                    du = psutil.disk_usage(p.mountpoint)
                    disks.append({
                        "device": p.device,
                        "mountpoint": p.mountpoint,
                        "total_gb": round(du.total / (1024**3), 1),
                        "used_gb": round(du.used / (1024**3), 1),
                        "free_gb": round(du.free / (1024**3), 1),
                        "percent": du.percent
                    })
                except Exception:
                    continue

            # Network Speeds (KB/s)
            cur_net = psutil.net_io_counters()
            bytes_recv = cur_net.bytes_recv - last_net.bytes_recv
            bytes_sent = cur_net.bytes_sent - last_net.bytes_sent
            down_kb_s = round((bytes_recv / 1024) / dt, 1)
            up_kb_s = round((bytes_sent / 1024) / dt, 1)
            last_net = cur_net
            last_time = now_time

            # Battery
            bat = psutil.sensors_battery()
            bat_percent = round(bat.percent, 1) if bat else None
            is_charging = bat.power_plugged if bat else None

            # Uptime
            uptime_secs = int(time.time() - psutil.boot_time())

            # Active Window Title
            active_win = get_active_window_title()

            # Top 20 Processes
            procs = []
            for p in psutil.process_iter(['pid', 'name', 'memory_info']):
                try:
                    mem = p.info.get('memory_info')
                    rss = mem.rss if mem else 0
                    procs.append({
                        "pid": p.info['pid'],
                        "name": p.info['name'] or "Unknown",
                        "memory_mb": round(rss / (1024 * 1024), 1)
                    })
                except Exception:
                    continue

            procs.sort(key=lambda x: x["memory_mb"], reverse=True)
            top_procs = procs[:20]

            payload = {
                "cpu_total": cpu_total,
                "cpu_cores": cpu_cores,
                "ram_total_gb": ram_total_gb,
                "ram_used_gb": ram_used_gb,
                "ram_percent": ram_percent,
                "disks": disks,
                "down_kb_s": down_kb_s,
                "up_kb_s": up_kb_s,
                "battery_percent": bat_percent,
                "is_charging": is_charging,
                "uptime_seconds": uptime_secs,
                "active_window": active_win,
                "top_processes": top_procs,
                "timestamp": int(now_time * 1000)
            }

            await websocket.send_text(json.dumps(payload))

    except WebSocketDisconnect:
        logger.info("Telemetry WebSocket disconnected.")
    except Exception as e:
        logger.debug(f"Telemetry WebSocket error: {e}")


# =============================================================================
# 4. REMOTE FILE EXPLORER & APIS
# =============================================================================

class KillProcessRequest(BaseModel):
    pid: int


class OpenFileRequest(BaseModel):
    path: str


class AlertRequest(BaseModel):
    message: str
    tts: bool = True


@app.get("/api/ping")
def api_ping(authenticated: bool = Depends(verify_http_pin)):
    return {
        "status": "ok",
        "device_name": DEVICE_NAME,
        "active_window": get_active_window_title(),
        "uptime": int(time.time() - psutil.boot_time()),
        "timestamp": int(time.time() * 1000)
    }


@app.get("/api/files")
def api_list_files(
    path: Optional[str] = Query(None),
    authenticated: bool = Depends(verify_http_pin)
):
    """Browse drives, system shortcuts, or directories."""
    if not path or path.strip() in ("", "root", "/"):
        drives = []
        for p in psutil.disk_partitions():
            drives.append({
                "name": f"Drive ({p.device})",
                "path": p.mountpoint,
                "is_dir": True,
                "is_drive": True
            })

        user_home = Path.home()
        shortcuts = [
            {"name": "Desktop", "path": str(user_home / "Desktop"), "is_dir": True},
            {"name": "Downloads", "path": str(user_home / "Downloads"), "is_dir": True},
            {"name": "Documents", "path": str(user_home / "Documents"), "is_dir": True},
            {"name": "Pictures", "path": str(user_home / "Pictures"), "is_dir": True},
        ]
        shortcuts = [s for s in shortcuts if os.path.exists(s["path"])]

        return {
            "current_path": "root",
            "parent_path": None,
            "drives": drives,
            "shortcuts": shortcuts,
            "items": []
        }

    target = Path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path does not exist")

    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Target path is not a directory")

    parent = str(target.parent) if target.parent != target else "root"
    items = []

    try:
        with os.scandir(str(target)) as entries:
            for entry in entries:
                try:
                    stat = entry.stat()
                    items.append({
                        "name": entry.name,
                        "path": entry.path,
                        "is_dir": entry.is_dir(),
                        "size_bytes": stat.st_size if not entry.is_dir() else 0,
                        "modified_iso": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_mtime)),
                        "ext": Path(entry.name).suffix.lower() if not entry.is_dir() else ""
                    })
                except (PermissionError, OSError):
                    continue

        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied to this directory")

    return {
        "current_path": str(target),
        "parent_path": parent,
        "items": items
    }


@app.get("/api/download")
def api_download_file(
    path: str = Query(...),
    authenticated: bool = Depends(verify_http_pin)
):
    """Download a file directly from Dell to phone."""
    target = Path(path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type="application/octet-stream"
    )


@app.post("/api/open-file")
def api_open_file(
    req: OpenFileRequest,
    authenticated: bool = Depends(verify_http_pin)
):
    """Launch/open file directly on Dell's desktop."""
    target = Path(req.path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File does not exist")

    try:
        os.startfile(str(target))
        return {"status": "ok", "message": f"Opened {target.name} on Dell."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file: {e}")


@app.post("/api/kill-process")
def api_kill_process(
    req: KillProcessRequest,
    authenticated: bool = Depends(verify_http_pin)
):
    """Terminate specific process by PID."""
    try:
        p = psutil.Process(req.pid)
        pname = p.name()
        p.kill()
        return {"status": "ok", "message": f"Killed process {pname} (PID: {req.pid})"}
    except psutil.NoSuchProcess:
        return {"status": "ok", "message": f"PID {req.pid} was already terminated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to terminate PID {req.pid}: {e}")


@app.post("/api/alert")
def api_remote_alert(
    req: AlertRequest,
    authenticated: bool = Depends(verify_http_pin)
):
    """Show alert on Dell and optionally speak aloud."""
    clean_msg = req.message.replace('"', "'")

    def _show_box():
        ctypes.windll.user32.MessageBoxW(0, clean_msg, "Remote Alert", 0x40 | 0x1000)
    threading.Thread(target=_show_box, daemon=True).start()

    if req.tts:
        def _speak():
            san = clean_msg.replace("'", "")
            cmd = f'powershell -c "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(\'{san}\')"'
            os.system(cmd)
        threading.Thread(target=_speak, daemon=True).start()

    return {"status": "ok", "message": "Alert dispatched."}


# =============================================================================
# 5. BUILT-IN CLOUDFLARE TUNNEL WATCHDOG
# =============================================================================

def ensure_cloudflared_binary() -> str:
    """Check for cloudflared.exe, download if missing, and return path."""
    exe_name = "cloudflared.exe" if sys.platform == "win32" else "cloudflared"
    local_path = os.path.join(BASE_DIR, exe_name)

    if os.path.exists(local_path):
        return local_path

    system_path = shutil.which("cloudflared")
    if system_path:
        return system_path

    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    logger.info(f"Downloading official cloudflared binary from: {url}...")
    urllib.request.urlretrieve(url, local_path)
    logger.info(f"cloudflared downloaded to {local_path}.")
    return local_path


def cloudflared_watchdog_loop():
    """
    Continuous watchdog: runs cloudflared.exe, restarts on crash/network drops,
    and publishes the live https://*.trycloudflare.com URL to Supabase.
    """
    global current_tunnel_url, tunnel_process

    bin_path = ensure_cloudflared_binary()

    # Clean up any lingering cloudflared instances from previous runs
    try:
        for proc in psutil.process_iter(['name', 'cmdline']):
            if proc.info['name'] and 'cloudflared' in proc.info['name'].lower():
                cmdline = ' '.join(proc.info.get('cmdline') or [])
                if str(SERVER_PORT) in cmdline or 'tunnel' in cmdline:
                    try:
                        proc.terminate()
                    except Exception:
                        pass
    except Exception:
        pass

    while server_running:
        try:
            logger.info("Starting Cloudflare Tunnel subprocess (HTTP/2 mode)...")
            cmd = [bin_path, "tunnel", "--protocol", "http2", "--url", f"http://127.0.0.1:{SERVER_PORT}"]
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

            tunnel_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                cwd=BASE_DIR,
                creationflags=flags
            )

            # Read stderr to extract the public URL
            while server_running and tunnel_process.poll() is None:
                if tunnel_process.stderr:
                    line = tunnel_process.stderr.readline()
                else:
                    line = ""
                if not line:
                    time.sleep(0.05)
                    continue
                match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
                if match:
                    found_url = match.group(0)
                    if found_url != current_tunnel_url:
                        current_tunnel_url = found_url
                        logger.info("=" * 65)
                        logger.info(f"LIVE CLOUDFLARE PUBLIC TUNNEL ESTABLISHED: {current_tunnel_url}")
                        logger.info("=" * 65)

                        # Publish to Supabase device_commands: expire old active rows first
                        if supabase_client:
                            try:
                                supabase_client.table("device_commands")\
                                    .update({"status": "expired"})\
                                    .eq("command", "TUNNEL_URL")\
                                    .eq("status", "active")\
                                    .execute()

                                supabase_client.table("device_commands").insert({
                                    "command": "TUNNEL_URL",
                                    "payload": current_tunnel_url,
                                    "status": "active"
                                }).execute()
                                logger.info("TUNNEL_URL published to Supabase; prior active rows marked expired.")
                            except Exception as sub_err:
                                logger.warning(f"Could not publish TUNNEL_URL to Supabase: {sub_err}")

            exit_code = tunnel_process.poll() if tunnel_process else None
            logger.warning(f"Cloudflare Tunnel exited with code {exit_code}. Restarting in 3 seconds...")
            time.sleep(3)

        except Exception as e:
            logger.warning(f"Cloudflare Tunnel watchdog exception: {e}. Retrying in 5 seconds...")
            time.sleep(5)


def background_heartbeat_loop():
    """Update device_telemetry in Supabase every 5 seconds so phone knows PC is alive."""
    while server_running:
        try:
            if supabase_client:
                cpu = psutil.cpu_percent(interval=0.5)
                ram = psutil.virtual_memory().percent
                bat = psutil.sensors_battery()
                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

                supabase_client.table("device_telemetry").upsert({
                    "id": DEVICE_ID,
                    "device_name": DEVICE_NAME,
                    "cpu_percent": round(cpu, 1),
                    "ram_percent": round(ram, 1),
                    "battery_percent": round(bat.percent, 1) if bat else None,
                    "is_charging": bat.power_plugged if bat else None,
                    "updated_at": now_iso
                }).execute()
        except Exception as e:
            logger.debug(f"Heartbeat loop error: {e}")

        time.sleep(5)


# =============================================================================
# MAIN SERVER ENTRYPOINT
# =============================================================================

def main():
    logger.info("=" * 65)
    logger.info("DELL LATITUDE 7490 - V3.0 PRO LIVE STREAMING SERVER")
    logger.info(f"Base Directory : {BASE_DIR}")
    logger.info(f"Local Server   : http://{SERVER_HOST}:{SERVER_PORT}")
    logger.info(f"Security PIN   : {ACCESS_PIN}")
    logger.info("=" * 65)

    # 1. Start Cloudflare Watchdog in background thread
    tunnel_thread = threading.Thread(target=cloudflared_watchdog_loop, daemon=True, name="CloudflaredWatchdog")
    tunnel_thread.start()

    # 2. Start Supabase Heartbeat in background thread
    heartbeat_thread = threading.Thread(target=background_heartbeat_loop, daemon=True, name="HeartbeatLoop")
    heartbeat_thread.start()

    # 3. Start Uvicorn HTTP & WebSocket server
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, log_level="warning")


if __name__ == "__main__":
    main()
