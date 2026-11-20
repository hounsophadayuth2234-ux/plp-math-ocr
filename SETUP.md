# 🛸 Cross-Device Remote Desktop System V3.0 PRO: Dell Latitude 7490 × Honor Win

A true live interactive remote desktop and full PC monitoring system engineered for high-performance, long-distance 4G/5G operation (hundreds of km away).

- **Production Web Remote (Mobile Native UI)**: [https://web-remote-flax.vercel.app](https://web-remote-flax.vercel.app)
- **Security Access PIN**: `123456`
- **Host Device**: Dell Latitude 7490 (Windows 10/11, Per-Monitor DPI Aware)
- **Direct Tunnel Backend**: FastAPI + Uvicorn + WebSockets + Cloudflare Tunnel Subprocess (`pc_server.py`)

---

## ⚡ V3.0 PRO Architecture

```
+--------------------------------------------------------------+
|               Honor Win Mobile Phone (Client)                |
|           iOS / Nothing OS Glass Native Mobile UI            |
|       4 Tabs: Screen | Monitor | Files & Apps | Tools        |
+------------------------------+-------------------------------+
                               |
             Direct WebSocket  |  Live Video Frames (15 FPS),
             Tunnel (~30-50ms) |  Interactive Input, Full Telemetry
                               v
+--------------------------------------------------------------+
|                Cloudflare Global Edge Network                |
|            https://*.trycloudflare.com (SSL Encrypted)       |
+------------------------------+-------------------------------+
                               ^
         Managed Tunnel Subprocess (cloudflared.exe)
                               |
+--------------------------------------------------------------+
|             Dell Latitude 7490 (Windows 10/11)               |
|            Python V3.0 Server (`pc_server.py`)               |
|   * FastAPI + Uvicorn on 127.0.0.1:8765                      |
|   * Per-Monitor DPI Awareness (ctypes shcore Mode 2)         |
|   * Thread-safe Screen Video Stream (/ws/screen, 10-15 FPS)  |
|   * Touch & Precision Mouse/Keyboard Control (/ws/control)   |
|   * Full Hardware Telemetry (/ws/telemetry every 2s)         |
|   * Remote File Explorer (/api/files, /api/download, open)   |
|   * Hardware Controls: Volume, Brightness, Boss Key, Power   |
+------------------------------+-------------------------------+
                               |
               Auto-Publish Tunnel URL & Heartbeat
                               v
+--------------------------------------------------------------+
|                    Supabase Cloud Backend                    |
|   * Table `device_commands`: `command = 'TUNNEL_URL'`        |
|   * Table `device_telemetry`: Heartbeat & stats              |
+--------------------------------------------------------------+
```

---

## 📱 4-Tab Mobile Web Remote Features

### 1. LIVE SCREEN (Default Main Tab)
- **Live Video Feed**: Continuous binary JPEG stream over `/ws/screen` at 10–18 FPS with dynamic quality presets (`480p`, `720p`, `1080p`).
- **Fullscreen Landscape Mode**: One tap switches phone to fullscreen landscape orientation for true Windows tablet control.
- **Two Control Modes**:
  - **Direct Touch**: Tap anywhere on Dell screen to click that exact app or button; double-tap = double click; long press (450ms) = right click; 2-finger drag = vertical scroll.
  - **Precision Cursor**: Smooth touchpad relative cursor movement + tap to click.
- **Floating Toolbar**:
  - Unicode/Khmer remote keyboard typing bar.
  - Shortcut buttons: `Win+D`, `Alt+Tab`, `Esc`, `Enter`, `Backspace`, `R-Click`.
  - Live FPS badge.

### 2. MONITOR (Full PC Tracking Tab)
- **Active Window Tracker**: Live banner displaying the exact title of the foreground window open on Dell.
- **Hardware Metric Cards**:
  - Total CPU % + per-core load.
  - RAM usage in GB and %.
  - All storage partitions (`C:`, `D:`) with used/total/free GB and % usage bars.
  - Real-time Network I/O (Download & Upload KB/s).
  - Battery % + charging status.
  - System Uptime.
- **Process Manager**: Top 20 memory-heavy processes with live search filter and working `Kill` button per PID.

### 3. FILES & APPS (Remote Explorer & Launcher Tab)
- **Remote File Explorer**:
  - Browse drives (`C:\`, `D:\`) and quick folders (Desktop, Downloads, Documents).
  - Tap folders to navigate; tap files to:
    - **Open on Dell Desktop**: Launches file/app on Dell with `os.startfile`.
    - **Download to Phone**: Streams file directly to mobile phone.
- **Quick App Launcher**: One-tap launch for Chrome, YouTube, File Explorer, Task Manager, Notepad, Calculator, VS Code.
- **Custom Launcher**: Open any custom URL or command.
- **Hardware Deck**: Volume slider (0-100%) + mute toggle, Brightness slider (0-100%), Media controls (`Prev`, `Play/Pause`, `Next`), Boss Key (`Win+D` + mute).

### 4. POWER & TOOLS
- **Power Controls**: `Screen Off` (monitor sleep only), `Wake Screen`, `Lock PC`, `Sleep`, `Restart` (confirm modal), `Shutdown` (confirm modal).
- **2-Way Clipboard Sync**: Push text from phone to Dell clipboard, or pull current Dell clipboard text to phone with one-tap copy.
- **Remote Alert / TTS**: Display notification box on Dell screen and/or speak message aloud via Windows Text-to-Speech synthesizer.

---

## 🛠️ Verification & Running

### 1. Start Server Daemon on Dell Latitude 7490:
```powershell
python pc_server.py
```
*(Automatically checks/downloads `cloudflared.exe`, establishes tunnel, and publishes URL to Supabase).*

### 2. Run Verification Script:
```powershell
python verify_v3.py
```

### 3. Access Live Web Remote:
Open **[https://web-remote-flax.vercel.app](https://web-remote-flax.vercel.app)** on your mobile phone, enter PIN `123456`, and enjoy live remote desktop control!
