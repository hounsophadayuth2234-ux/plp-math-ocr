"""
Cross-Device Remote Control System - PC Agent V2.0 PRO (Windows 10/11)
Dell Latitude 7490 Automation Service

V2.0 PRO Upgrades:
1. Realtime Broadcast Listener over WebSockets ('remote-control-live' channel)
   for ultra-low-latency (~50-150ms) Mouse, Keyboard, Media, Brightness, and App Launching.
2. pyautogui.PAUSE = 0, pyautogui.FAILSAFE = False for zero lag.
3. Windows ctypes native integration for Screen Off, Wake Screen, Lock, Sleep.
4. pycaw & screen_brightness_control for Volume and Brightness mastery.
5. 2-way Clipboard Sync, Live Process Manager (kill PID), Alert/TTS.
6. Auto-reconnecting WebSocket client with active DB polling fallback.
7. Continuous 5s telemetry loop for CPU, RAM, Battery, Charging state.
"""

import os
import sys
import time
import io
import ctypes
import logging
import threading
import datetime
import traceback
import webbrowser
import asyncio
from typing import Optional, Dict, Any, List

from dotenv import load_dotenv
import psutil
import pyperclip
from PIL import Image
import pyautogui
from supabase import create_client, create_async_client, Client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("pc_agent_v2")

# Ultra-low latency settings for pyautogui
pyautogui.PAUSE = 0.0
pyautogui.FAILSAFE = False

# Enable Per-Monitor DPI awareness on Windows to prevent zoomed/clipped screenshots
if sys.platform == "win32":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        logger.info("Per-Monitor DPI awareness enabled.")
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
            logger.info("Process DPI awareness enabled.")
        except Exception as e:
            logger.warning(f"Could not set DPI awareness: {e}")

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
DEVICE_ID = int(os.getenv("DEVICE_ID", "1"))
DEVICE_NAME = os.getenv("DEVICE_NAME", "Dell Latitude 7490")
TELEMETRY_INTERVAL = int(os.getenv("TELEMETRY_INTERVAL", "5"))
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "screenshots")
BROADCAST_CHANNEL_NAME = "remote-control-live"

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("FATAL: SUPABASE_URL and SUPABASE_KEY must be set in .env file.")
    sys.exit(1)

# Initialize Supabase sync client
logger.info(f"Connecting sync Supabase client to: {SUPABASE_URL}")
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase sync client initialized.")
except Exception as e:
    logger.error(f"Failed to initialize Supabase client: {e}")
    sys.exit(1)

running = True
command_lock = threading.Lock()
processed_command_ids = set()
permission_warning_logged = False

# Global reference to async broadcast channel for sending responses back
async_broadcast_channel = None
async_event_loop = None


def log_permission_hint(error_obj: Any):
    global permission_warning_logged
    if not permission_warning_logged:
        permission_warning_logged = True
        logger.warning("=" * 65)
        logger.warning("DATABASE PERMISSION NOTICE (Postgres 42501):")
        logger.warning("If telemetry or DB inserts fail, verify grants in SQL Editor:")
        logger.warning("  GRANT USAGE ON SCHEMA public TO anon, authenticated;")
        logger.warning("  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;")
        logger.warning("  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;")
        logger.warning("=" * 65)


def get_screen_resolution():
    """Return primary display width and height."""
    try:
        w, h = pyautogui.size()
        return int(w), int(h)
    except Exception:
        return ctypes.windll.user32.GetSystemMetrics(0), ctypes.windll.user32.GetSystemMetrics(1)


# =============================================================================
# HARDWARE & SYSTEM CONTROLS (VOLUME, BRIGHTNESS, SCREEN, POWER)
# =============================================================================

def set_system_volume(level: int) -> str:
    """Set master system volume (0-100%)."""
    try:
        from pycaw.pycaw import AudioUtilities
        spk = AudioUtilities.GetSpeakers()
        if spk and hasattr(spk, 'EndpointVolume'):
            clamped = max(0.0, min(1.0, float(level) / 100.0))
            spk.EndpointVolume.SetMasterVolumeLevelScalar(clamped, None)
            # Unmute if volume was raised
            if clamped > 0 and spk.EndpointVolume.GetMute():
                spk.EndpointVolume.SetMute(0, None)
            return f"Volume set to {level}%"
    except Exception as e:
        logger.warning(f"Error setting volume via pycaw: {e}")
    return f"Failed to set volume to {level}%"


def toggle_system_mute() -> str:
    """Toggle master audio mute."""
    try:
        from pycaw.pycaw import AudioUtilities
        spk = AudioUtilities.GetSpeakers()
        if spk and hasattr(spk, 'EndpointVolume'):
            is_muted = spk.EndpointVolume.GetMute()
            spk.EndpointVolume.SetMute(0 if is_muted else 1, None)
            return f"Audio {'unmuted' if is_muted else 'muted'}"
    except Exception:
        pass
    pyautogui.press('volumemute')
    return "Mute toggled via virtual key."


def set_system_brightness(level: int) -> str:
    """Set primary display brightness (0-100%)."""
    try:
        import screen_brightness_control as sbc
        clamped = max(0, min(100, int(level)))
        sbc.set_brightness(clamped)
        return f"Brightness set to {clamped}%"
    except Exception as e:
        logger.warning(f"Error setting brightness via sbc: {e}")
        return f"Could not set brightness: {e}"


def execute_screen_off() -> str:
    """Turn display off immediately without sleeping system."""
    logger.info("Executing SCREEN_OFF: Turning display off (SC_MONITORPOWER, 2)...")
    # HWND_BROADCAST = 0xFFFF, WM_SYSCOMMAND = 0x0112, SC_MONITORPOWER = 0xF170, 2 = OFF
    ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, 2)
    return "Display powered off."


def execute_wake_screen() -> str:
    """Wake display by nudging mouse cursor and sending benign input."""
    logger.info("Executing WAKE_SCREEN: Nudging mouse to wake display...")
    try:
        pyautogui.moveRel(1, 0, _pause=False)
        time.sleep(0.03)
        pyautogui.moveRel(-1, 0, _pause=False)
        ctypes.windll.user32.mouse_event(1, 0, 0, 0, 0)
        return "Display wake pulse sent."
    except Exception as e:
        return f"Wake screen error: {e}"


def execute_boss_key() -> str:
    """Boss Key: Mute audio immediately and minimize all open windows (Win+D)."""
    logger.info("Executing BOSS_KEY: Muting audio and minimizing all windows...")
    try:
        from pycaw.pycaw import AudioUtilities
        spk = AudioUtilities.GetSpeakers()
        if spk and hasattr(spk, 'EndpointVolume'):
            spk.EndpointVolume.SetMute(1, None)
    except Exception:
        pyautogui.press('volumemute')
    pyautogui.hotkey('win', 'd')
    return "Boss mode engaged: Windows minimized and audio muted."


def execute_lock() -> str:
    """Lock Windows screen immediately."""
    logger.info("Executing LOCK: Locking workstation...")
    res = ctypes.windll.user32.LockWorkStation()
    if res == 0:
        raise RuntimeError(f"LockWorkStation failed: {ctypes.GetLastError()}")
    return "Workstation locked successfully."


def execute_sleep() -> str:
    """Put PC into sleep mode."""
    logger.info("Executing SLEEP: Putting system into sleep...")
    try:
        res = ctypes.windll.powrprof.SetSuspendState(0, 1, 0)
        if res == 0:
            raise RuntimeError("powrprof SetSuspendState returned 0")
        return "System suspended."
    except Exception as e:
        logger.warning(f"SetSuspendState error ({e}), running rundll32 fallback...")
        os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")
        return "Sleep command dispatched."


def execute_shutdown() -> str:
    """Shutdown Windows PC in 5 seconds."""
    logger.info("Executing SHUTDOWN: Scheduled shutdown in 5s...")
    os.system('shutdown /s /t 5 /c "Shutdown command initiated remotely via Supabase"')
    return "Shutdown command dispatched for 5s."


def execute_restart() -> str:
    """Restart Windows PC in 5 seconds."""
    logger.info("Executing RESTART: Scheduled restart in 5s...")
    os.system('shutdown /r /t 5 /c "Restart initiated remotely via Supabase"')
    return "Restart command dispatched for 5s."


# =============================================================================
# MOUSE & KEYBOARD CONTROLS
# =============================================================================

def handle_mouse_move(dx: int, dy: int):
    """Relative mouse movement with zero pause."""
    try:
        pyautogui.moveRel(int(dx), int(dy), _pause=False)
    except Exception as e:
        logger.debug(f"Mouse move error: {e}")


def handle_mouse_click(button: str = "left"):
    """Trigger mouse clicks or mouse down/up."""
    try:
        b = (button or "left").lower()
        if b == "left":
            pyautogui.click()
        elif b == "right":
            pyautogui.rightClick()
        elif b == "double":
            pyautogui.doubleClick()
        elif b == "down":
            pyautogui.mouseDown()
        elif b == "up":
            pyautogui.mouseUp()
        else:
            pyautogui.click()
    except Exception as e:
        logger.debug(f"Mouse click error: {e}")


def handle_mouse_click_at(x_ratio: float, y_ratio: float, button: str = "left"):
    """Click on exact coordinate on Dell screen mapped from screenshot modal ratios (0.0 - 1.0)."""
    try:
        screen_w, screen_h = get_screen_resolution()
        target_x = int(screen_w * max(0.0, min(1.0, float(x_ratio))))
        target_y = int(screen_h * max(0.0, min(1.0, float(y_ratio))))
        logger.info(f"MOUSE_CLICK_AT: ({x_ratio:.3f}, {y_ratio:.3f}) -> Dell pixel ({target_x}, {target_y})")
        if (button or "left").lower() == "right":
            pyautogui.rightClick(target_x, target_y)
        else:
            pyautogui.click(target_x, target_y)
    except Exception as e:
        logger.warning(f"Error handling MOUSE_CLICK_AT: {e}")


def handle_mouse_scroll(dy: int):
    """Handle vertical mouse wheel scroll."""
    try:
        pyautogui.scroll(int(dy))
    except Exception as e:
        logger.debug(f"Mouse scroll error: {e}")


def handle_key_type(text: str):
    """
    Type text onto PC. If text contains non-ASCII characters (e.g. Khmer / Unicode),
    safely inject via clipboard paste to prevent mangling.
    """
    if not text:
        return
    try:
        # Check if text contains non-ASCII (Unicode, Khmer, special symbols)
        if any(ord(char) > 127 for char in text):
            pyperclip.copy(text)
            time.sleep(0.02)
            pyautogui.hotkey('ctrl', 'v')
            logger.info(f"Typed Unicode text via clipboard injection ({len(text)} chars)")
        else:
            pyautogui.write(text, interval=0.005)
    except Exception as e:
        logger.warning(f"Key type error: {e}")


def handle_key_combo(combo: str):
    """
    Execute key combinations or special keys.
    Examples: 'enter', 'backspace', 'esc', 'tab', 'win', 'alt+tab', 'ctrl+c', 'ctrl+v', 'ctrl+z', 'alt+f4'
    """
    if not combo:
        return
    try:
        normalized = combo.strip().lower()
        parts = [p.strip() for p in normalized.split("+") if p.strip()]
        
        # Translation map for shortcut keys
        key_alias = {
            "win": "winleft",
            "cmd": "winleft",
            "super": "winleft",
            "ctrl": "ctrl",
            "alt": "alt",
            "shift": "shift",
            "enter": "enter",
            "return": "enter",
            "backspace": "backspace",
            "esc": "esc",
            "escape": "esc",
            "tab": "tab",
            "space": "space",
            "up": "up",
            "down": "down",
            "left": "left",
            "right": "right",
            "delete": "delete",
            "del": "delete",
            "f4": "f4",
        }
        mapped_parts = [key_alias.get(p, p) for p in parts]

        if len(mapped_parts) == 1:
            pyautogui.press(mapped_parts[0])
            logger.info(f"Pressed single key: {mapped_parts[0]}")
        elif len(mapped_parts) > 1:
            pyautogui.hotkey(*mapped_parts)
            logger.info(f"Executed hotkey combo: {' + '.join(mapped_parts)}")
    except Exception as e:
        logger.warning(f"Key combo error ({combo}): {e}")


def handle_window_action(action: str):
    """Window management shortcuts: switch, minimize, maximize, close."""
    act = (action or "").lower()
    if act == "switch":
        pyautogui.hotkey("alt", "tab")
    elif act == "minimize":
        pyautogui.hotkey("win", "down")
    elif act == "maximize":
        pyautogui.hotkey("win", "up")
    elif act == "close":
        pyautogui.hotkey("alt", "f4")


# =============================================================================
# APP LAUNCHER & URLS
# =============================================================================

def handle_app_launch(app: str, custom: Optional[str] = None) -> str:
    """Launch designated desktop apps or custom targets."""
    target = (app or "").lower().strip()
    logger.info(f"APP_LAUNCH requested: '{target}' (custom: '{custom}')")

    try:
        if target == "chrome":
            os.system("start chrome")
            return "Launched Google Chrome."
        elif target == "youtube":
            webbrowser.open("https://www.youtube.com")
            return "Opened YouTube in default browser."
        elif target == "explorer":
            os.system("start explorer.exe")
            return "Opened File Explorer."
        elif target == "taskmgr":
            os.system("start taskmgr.exe")
            return "Opened Task Manager."
        elif target == "notepad":
            os.system("start notepad.exe")
            return "Opened Notepad."
        elif target == "calc":
            os.system("start calc.exe")
            return "Opened Calculator."
        elif target in ("vscode", "ide", "code"):
            os.system("start code")
            return "Launched VS Code."
        elif target == "custom" and custom:
            trimmed = custom.strip()
            if trimmed.startswith(("http://", "https://")):
                webbrowser.open(trimmed)
                return f"Opened URL: {trimmed}"
            else:
                os.system(f'start "" "{trimmed}"')
                return f"Launched custom command: {trimmed}"
        else:
            return f"Unknown app launcher target: {target}"
    except Exception as e:
        logger.error(f"Failed to launch app '{target}': {e}")
        return f"Launch failed: {e}"


# =============================================================================
# TOOLS: CLIPBOARD, PROCESSES, ALERTS, SCREENSHOT
# =============================================================================

def execute_clipboard(payload: Optional[str]) -> str:
    """Copy text directly into the Windows clipboard."""
    text = payload if payload is not None else ""
    logger.info(f"Executing CLIPBOARD: Copying {len(text)} characters to clipboard...")
    pyperclip.copy(text)
    return f"Copied {len(text)} characters to clipboard."


def get_current_clipboard() -> str:
    """Read Dell Latitude current clipboard content."""
    try:
        return pyperclip.paste() or ""
    except Exception as e:
        logger.warning(f"Error reading clipboard: {e}")
        return ""


def get_top_processes(limit: int = 8) -> List[Dict[str, Any]]:
    """Scan and return the top memory-consuming processes."""
    procs = []
    for proc in psutil.process_iter(['pid', 'name', 'memory_info']):
        try:
            mem_info = proc.info.get('memory_info')
            rss = mem_info.rss if mem_info else 0
            procs.append({
                'pid': proc.info.get('pid'),
                'name': proc.info.get('name') or "Unknown",
                'memory_mb': round(rss / (1024 * 1024), 1)
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception:
            continue

    procs.sort(key=lambda x: x['memory_mb'], reverse=True)
    return procs[:limit]


def kill_specific_process(pid: int) -> str:
    """Kill a specific process by PID."""
    try:
        proc = psutil.Process(int(pid))
        pname = proc.name()
        proc.kill()
        logger.info(f"Killed process {pname} (PID: {pid})")
        return f"Successfully terminated {pname} (PID: {pid})"
    except psutil.NoSuchProcess:
        return f"PID {pid} no longer exists."
    except Exception as e:
        logger.warning(f"Failed to kill PID {pid}: {e}")
        return f"Failed to kill PID {pid}: {e}"


def execute_clean_ram() -> str:
    """Find chrome.exe or node.exe processes using over 500MB RAM and terminate them."""
    logger.info("Executing CLEAN_RAM: Scanning for chrome.exe and node.exe > 500MB...")
    threshold_bytes = 500 * 1024 * 1024
    target_names = {"chrome.exe", "node.exe"}
    terminated_processes = []
    total_freed_mb = 0.0

    for proc in psutil.process_iter(['pid', 'name', 'memory_info']):
        try:
            name = proc.info.get('name')
            if name and name.lower() in target_names:
                mem_info = proc.info.get('memory_info')
                rss = mem_info.rss if mem_info else 0
                if rss > threshold_bytes:
                    mb = round(rss / (1024 * 1024), 1)
                    pid = proc.info.get('pid')
                    logger.info(f"Terminating heavy process: {name} (PID: {pid}, Memory: {mb}MB)")
                    proc.terminate()
                    terminated_processes.append(f"{name} (PID {pid}, {mb}MB)")
                    total_freed_mb += mb
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception as e:
            logger.warning(f"Error inspecting process: {e}")

    summary = f"Cleaned {len(terminated_processes)} processes, freed ~{round(total_freed_mb, 1)}MB RAM: {', '.join(terminated_processes) or 'None exceeded 500MB'}"
    logger.info(summary)
    return summary


def execute_alert_popup(message: str, tts: bool = True):
    """Display a Windows notification / message box and optionally speak via TTS."""
    clean_msg = (message or "Alert from Honor Win Remote").replace('"', "'")
    logger.info(f"Executing ALERT_POPUP: '{clean_msg}' (TTS: {tts})")

    # Non-blocking MessageBox on separate thread
    def _show_box():
        ctypes.windll.user32.MessageBoxW(0, clean_msg, "Remote Control Alert", 0x40 | 0x1000)

    threading.Thread(target=_show_box, daemon=True).start()

    # Optional speech synthesis via PowerShell SAPI
    if tts:
        def _speak():
            sanitized = clean_msg.replace("'", "")
            cmd = f'powershell -c "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(\'{sanitized}\')"'
            os.system(cmd)
        threading.Thread(target=_speak, daemon=True).start()


def execute_screenshot() -> str:
    """Capture full desktop screenshot, upload to Supabase Storage, and update telemetry."""
    logger.info("Executing SCREENSHOT: Capturing desktop screenshot...")
    screenshot = pyautogui.screenshot()

    buffer = io.BytesIO()
    screenshot.save(buffer, format="PNG", optimize=True)
    img_bytes = buffer.getvalue()
    logger.info(f"Captured screenshot: {len(img_bytes)} bytes. Uploading to bucket '{STORAGE_BUCKET}'...")

    file_path = "latest.png"

    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=file_path,
            file=img_bytes,
            file_options={"content-type": "image/png", "upsert": "true"}
        )
    except Exception as e1:
        logger.debug(f"Direct upload note: {e1}. Trying update...")
        try:
            supabase.storage.from_(STORAGE_BUCKET).update(
                path=file_path,
                file=img_bytes,
                file_options={"content-type": "image/png", "upsert": "true"}
            )
        except Exception as e2:
            logger.warning(f"Update note: {e2}. Trying remove & upload...")
            supabase.storage.from_(STORAGE_BUCKET).remove([file_path])
            supabase.storage.from_(STORAGE_BUCKET).upload(
                path=file_path,
                file=img_bytes,
                file_options={"content-type": "image/png"}
            )

    public_url_resp = supabase.storage.from_(STORAGE_BUCKET).get_public_url(file_path)
    base_url = public_url_resp if isinstance(public_url_resp, str) else public_url_resp.get("publicURL", "")
    if "?" in base_url:
        base_url = base_url.split("?")[0]

    timestamp = int(time.time() * 1000)
    cache_busted_url = f"{base_url}?t={timestamp}"
    logger.info(f"Screenshot uploaded. URL: {cache_busted_url}")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    supabase.table("device_telemetry").update({
        "screenshot_url": cache_busted_url,
        "updated_at": now_iso
    }).eq("id", DEVICE_ID).execute()

    return f"Screenshot uploaded: {cache_busted_url}"


# =============================================================================
# UNIFIED COMMAND DISPATCHER (BROADCAST & DATABASE)
# =============================================================================

def dispatch_command_action(cmd_name: str, payload_data: Any) -> Optional[str]:
    """Execute any command from Broadcast or DB."""
    cmd = (cmd_name or "").upper().strip()

    if cmd == "MOUSE_MOVE":
        dx = payload_data.get("dx", 0) if isinstance(payload_data, dict) else 0
        dy = payload_data.get("dy", 0) if isinstance(payload_data, dict) else 0
        handle_mouse_move(dx, dy)
        return "Mouse moved."

    elif cmd == "MOUSE_CLICK":
        button = payload_data.get("button", "left") if isinstance(payload_data, dict) else "left"
        handle_mouse_click(button)
        return f"Mouse click {button} executed."

    elif cmd == "MOUSE_CLICK_AT":
        if isinstance(payload_data, dict):
            xr = payload_data.get("x_ratio", 0.0)
            yr = payload_data.get("y_ratio", 0.0)
            btn = payload_data.get("button", "left")
            handle_mouse_click_at(xr, yr, btn)
            return f"Clicked at ({xr}, {yr})"
        return "Invalid MOUSE_CLICK_AT payload."

    elif cmd == "MOUSE_SCROLL":
        dy = payload_data.get("dy", 0) if isinstance(payload_data, dict) else 0
        handle_mouse_scroll(dy)
        return "Mouse scrolled."

    elif cmd == "KEY_TYPE":
        text = payload_data.get("text", "") if isinstance(payload_data, dict) else str(payload_data or "")
        handle_key_type(text)
        return f"Typed {len(text)} characters."

    elif cmd == "KEY_COMBO":
        combo = payload_data.get("combo", "") if isinstance(payload_data, dict) else str(payload_data or "")
        handle_key_combo(combo)
        return f"Executed key combo: {combo}"

    elif cmd == "WINDOW_ACTION":
        act = payload_data.get("action", "") if isinstance(payload_data, dict) else str(payload_data or "")
        handle_window_action(act)
        return f"Window action executed: {act}"

    elif cmd == "APP_LAUNCH":
        if isinstance(payload_data, dict):
            app = payload_data.get("app", "")
            custom = payload_data.get("custom")
            return handle_app_launch(app, custom)
        else:
            return handle_app_launch(str(payload_data or ""))

    elif cmd == "MEDIA_KEY":
        action = payload_data.get("action", "") if isinstance(payload_data, dict) else str(payload_data or "")
        act_l = action.lower()
        if act_l == "playpause":
            pyautogui.press("playpause")
        elif act_l == "next":
            pyautogui.press("nexttrack")
        elif act_l == "prev":
            pyautogui.press("prevtrack")
        elif act_l == "mute":
            toggle_system_mute()
        return f"Media key dispatched: {action}"

    elif cmd == "SET_VOLUME":
        vol = payload_data.get("volume", 50) if isinstance(payload_data, dict) else int(payload_data or 50)
        return set_system_volume(int(vol))

    elif cmd == "SET_BRIGHTNESS":
        bri = payload_data.get("brightness", 50) if isinstance(payload_data, dict) else int(payload_data or 50)
        return set_system_brightness(int(bri))

    elif cmd == "SCREEN_OFF":
        return execute_screen_off()

    elif cmd == "WAKE_SCREEN":
        return execute_wake_screen()

    elif cmd == "BOSS_KEY":
        return execute_boss_key()

    elif cmd == "LOCK":
        return execute_lock()

    elif cmd == "SLEEP":
        return execute_sleep()

    elif cmd == "SHUTDOWN":
        return execute_shutdown()

    elif cmd == "RESTART":
        return execute_restart()

    elif cmd == "CLIPBOARD":
        text = payload_data.get("text", "") if isinstance(payload_data, dict) else str(payload_data or "")
        return execute_clipboard(text)

    elif cmd == "OPEN_URL":
        url = payload_data.get("url", "") if isinstance(payload_data, dict) else str(payload_data or "")
        if url and not url.startswith(("http://", "https://")):
            url = "https://" + url
        webbrowser.open(url)
        return f"Opened URL: {url}"

    elif cmd == "CLEAN_RAM":
        return execute_clean_ram()

    elif cmd == "SCREENSHOT":
        return execute_screenshot()

    elif cmd == "KILL_PROCESS":
        pid = payload_data.get("pid") if isinstance(payload_data, dict) else int(payload_data)
        return kill_specific_process(int(pid))

    elif cmd == "ALERT_POPUP":
        msg = payload_data.get("message", "Alert from mobile") if isinstance(payload_data, dict) else str(payload_data or "")
        tts = payload_data.get("tts", True) if isinstance(payload_data, dict) else True
        execute_alert_popup(msg, tts)
        return f"Alert popup triggered: {msg}"

    else:
        logger.warning(f"Unrecognized command: '{cmd}'")
        return f"Unknown command: '{cmd}'"


# =============================================================================
# DATABASE COMMAND EXECUTION (PERSISTENT & AUDITED)
# =============================================================================

def process_db_command(cmd_record: Dict[str, Any]):
    """Execute a single database command record safely with DB status updates."""
    cmd_id = cmd_record.get("id")
    command_name = (cmd_record.get("command") or "").strip().upper()
    payload = cmd_record.get("payload")

    if not cmd_id or cmd_id in processed_command_ids:
        return

    with command_lock:
        if cmd_id in processed_command_ids:
            return
        processed_command_ids.add(cmd_id)

        logger.info(f">>> [DB QUEUE] COMMAND [{cmd_id}]: {command_name} (payload: {payload})")

        # Mark as executing
        try:
            supabase.table("device_commands").update({"status": "executing"}).eq("id", cmd_id).execute()
        except Exception as e:
            logger.warning(f"Could not update status to 'executing': {e}")

        success = False
        error_msg = None
        result_message = ""

        try:
            # Parse payload if JSON
            payload_data = payload
            if isinstance(payload, str) and (payload.startswith("{") or payload.startswith("[")):
                try:
                    import json
                    payload_data = json.loads(payload)
                except Exception:
                    payload_data = payload

            result_message = dispatch_command_action(command_name, payload_data) or "Executed successfully."
            success = True
            logger.info(f"Command [{cmd_id}] {command_name} succeeded: {result_message}")

        except Exception as exc:
            error_msg = str(exc)
            logger.error(f"Command [{cmd_id}] {command_name} failed: {exc}")
            logger.debug(traceback.format_exc())

        final_status = "executed" if success else "failed"
        finish_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            supabase.table("device_commands").update({
                "status": final_status,
                "executed_at": finish_iso,
                "error_message": error_msg
            }).eq("id", cmd_id).execute()
        except Exception as e:
            logger.error(f"Failed to update command [{cmd_id}] final status: {e}")


def poll_pending_commands():
    """Fallback DB poller to guarantee no persistent command is missed."""
    while running:
        try:
            response = supabase.table("device_commands") \
                .select("*") \
                .eq("status", "pending") \
                .order("created_at", desc=False) \
                .limit(10) \
                .execute()

            records = response.data or []
            for record in records:
                process_db_command(record)
        except Exception as e:
            if "permission denied" in str(e).lower() or "42501" in str(e):
                log_permission_hint(e)
            else:
                logger.debug(f"Polling loop check exception: {e}")

        time.sleep(1.0)


# =============================================================================
# SUPABASE REALTIME BROADCAST LISTENER (ULTRA-LOW LATENCY WEBSOCKETS)
# =============================================================================

async def broadcast_response(event_type: str, data: Any):
    """Send broadcast message back to phone (e.g., clipboard text, process list)."""
    global async_broadcast_channel
    if async_broadcast_channel:
        try:
            await async_broadcast_channel.send_broadcast(
                event="agent_response",
                data={"type": event_type, "data": data, "timestamp": int(time.time() * 1000)}
            )
            logger.info(f"Broadcasted '{event_type}' response back to mobile.")
        except Exception as e:
            logger.warning(f"Error broadcasting response back: {e}")


def handle_broadcast_message(msg_payload: Dict[str, Any]):
    """Handle instant broadcast commands arriving directly over WebSockets (~50-150ms)."""
    try:
        data = msg_payload.get("payload") or {}
        command = data.get("command") or data.get("cmd") or ""
        command_upper = str(command).upper().strip()

        # Handle Query Tools that send immediate broadcast replies back
        if command_upper == "GET_CLIPBOARD":
            cb_text = get_current_clipboard()
            if async_event_loop and async_broadcast_channel:
                asyncio.run_coroutine_threadsafe(
                    broadcast_response("CLIPBOARD_DATA", {"text": cb_text}),
                    async_event_loop
                )
            return

        elif command_upper == "GET_TOP_PROCESSES":
            top_procs = get_top_processes(limit=8)
            if async_event_loop and async_broadcast_channel:
                asyncio.run_coroutine_threadsafe(
                    broadcast_response("PROCESSES_DATA", {"processes": top_procs}),
                    async_event_loop
                )
            return

        # Direct execution of mouse, keyboard, media, and hardware actions
        dispatch_command_action(command_upper, data)

    except Exception as e:
        logger.error(f"Error handling broadcast message: {e}")


async def realtime_broadcast_loop():
    """Maintain WebSocket connection to Supabase Realtime Broadcast channel with auto-reconnect."""
    global async_broadcast_channel, async_event_loop
    async_event_loop = asyncio.get_running_loop()

    while running:
        try:
            logger.info(f"Connecting to Supabase Realtime WebSocket channel '{BROADCAST_CHANNEL_NAME}'...")
            async_client = await create_async_client(SUPABASE_URL, SUPABASE_KEY)
            channel = async_client.channel(
                BROADCAST_CHANNEL_NAME,
                params={"config": {"broadcast": {"ack": False, "self": False}}}
            )

            # Subscribe to broadcast events
            channel.on_broadcast(event="cmd", callback=handle_broadcast_message)
            await channel.subscribe()
            async_broadcast_channel = channel
            logger.info(f"Connected & Subscribed to Realtime Broadcast channel '{BROADCAST_CHANNEL_NAME}'!")

            # Keep active and monitor connection
            while running:
                await asyncio.sleep(1)

        except Exception as e:
            logger.warning(f"Realtime WebSocket channel disconnected: {e}. Reconnecting in 3 seconds...")
            async_broadcast_channel = None
            await asyncio.sleep(3)


def start_async_thread():
    """Dedicated background thread for the async WebSocket event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(realtime_broadcast_loop())
    except Exception as e:
        logger.debug(f"Async broadcast thread ended: {e}")
    finally:
        loop.close()


# =============================================================================
# TELEMETRY LOOP (HARDWARE STATS BROADCAST EVERY 5S)
# =============================================================================

def telemetry_loop():
    """Continuously upsert Dell Latitude 7490 hardware metrics every 5 seconds."""
    logger.info(f"Starting hardware telemetry loop (every {TELEMETRY_INTERVAL}s)...")
    psutil.cpu_percent(interval=None)

    while running:
        try:
            cpu = psutil.cpu_percent(interval=0.5)
            ram = psutil.virtual_memory().percent

            battery = psutil.sensors_battery()
            battery_percent = round(battery.percent, 1) if battery else None
            is_charging = battery.power_plugged if battery else None

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            telemetry_payload = {
                "id": DEVICE_ID,
                "device_name": DEVICE_NAME,
                "cpu_percent": round(cpu, 1),
                "ram_percent": round(ram, 1),
                "battery_percent": battery_percent,
                "is_charging": is_charging,
                "updated_at": now_iso
            }

            supabase.table("device_telemetry").upsert(telemetry_payload).execute()
            logger.info(f"Telemetry: CPU={cpu}% | RAM={ram}% | Battery={battery_percent}% (Charging: {is_charging})")

        except Exception as e:
            if "permission denied" in str(e).lower() or "42501" in str(e):
                log_permission_hint(e)
            else:
                logger.error(f"Telemetry loop error: {e}")

        time.sleep(max(1.0, TELEMETRY_INTERVAL - 0.5))


# =============================================================================
# MAIN ENTRYPOINT
# =============================================================================

def main():
    global running
    w, h = get_screen_resolution()
    logger.info("=" * 65)
    logger.info("DELL LATITUDE 7490 REMOTE CONTROL AGENT - V2.0 PRO")
    logger.info(f"Primary Display Resolution : {w}x{h}")
    logger.info(f"Host Device Name           : {DEVICE_NAME} (ID: {DEVICE_ID})")
    logger.info(f"Realtime Broadcast Channel : {BROADCAST_CHANNEL_NAME} (~50-150ms)")
    logger.info(f"Hardware Telemetry Rate    : Every {TELEMETRY_INTERVAL} seconds")
    logger.info("=" * 65)

    # Initialize / verify device_telemetry record
    try:
        supabase.table("device_telemetry").upsert({
            "id": DEVICE_ID,
            "device_name": DEVICE_NAME,
            "cpu_percent": 0.0,
            "ram_percent": 0.0,
            "battery_percent": 100.0,
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }).execute()
        logger.info("Device telemetry row verified in Supabase.")
    except Exception as e:
        if "permission denied" in str(e).lower() or "42501" in str(e):
            log_permission_hint(e)
        else:
            logger.warning(f"Telemetry record verification note: {e}")

    # 1. Start Async Realtime Broadcast thread
    rt_thread = threading.Thread(target=start_async_thread, daemon=True, name="AsyncBroadcast")
    rt_thread.start()

    # 2. Start Database Polling fallback thread
    poll_thread = threading.Thread(target=poll_pending_commands, daemon=True, name="DBPoller")
    poll_thread.start()

    # 3. Start Telemetry thread
    telemetry_thread = threading.Thread(target=telemetry_loop, daemon=True, name="TelemetryLoop")
    telemetry_thread.start()

    logger.info("All background threads active. Listening for live broadcast & database commands...")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Agent shutdown requested by user (Ctrl+C). Cleaning up...")
        running = False
        time.sleep(0.5)
        logger.info("Agent terminated cleanly.")


if __name__ == "__main__":
    main()
