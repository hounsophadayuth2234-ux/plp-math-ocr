# 🚀 Cross-Device Remote Control System V2.0 PRO: Dell Latitude 7490 × Honor Win

A high-performance, ultra-low-latency (~50-150ms) cross-device management and automation system connecting your Windows laptop (**Dell Latitude 7490**) to your mobile phone (**Honor Win**) using **Supabase Realtime Broadcast WebSockets** and Next.js.

- **Production Mobile Web Remote**: [https://web-remote-flax.vercel.app](https://web-remote-flax.vercel.app)
- **Default Access PIN**: `123456`

---

## ⚡ V2.0 PRO Low-Latency Architecture

```
+--------------------------------------------------------------+
|               Honor Win Mobile Phone (Client)                |
|           iOS / Nothing OS Glass Native Mobile UI            |
|         4 Tabs: Control | Trackpad | Launcher | Tools        |
+------------------------------+-------------------------------+
                               |
             Direct WebSocket  |  Instant Telemetry & Responses
             Broadcast (~50ms) |  (CLIPBOARD_DATA, PROCS)
                               v
+--------------------------------------------------------------+
|                    Supabase Cloud Backend                    |
|   * Realtime Channel: `remote-control-live` (WebSockets)     |
|   * Postgres Tables: `device_commands`, `device_telemetry`    |
|   * Storage Bucket: `screenshots` (public access)            |
+------------------------------+-------------------------------+
                               ^
             Subscribed Loop   |  Upload latest.png
             & Reconnect Guard |  & Send Telemetry (5s)
                               |
+--------------------------------------------------------------+
|             Dell Latitude 7490 (Windows 10/11)               |
|            Python V2.0 Agent (`pc_agent.py`)                 |
|   * pyautogui.PAUSE = 0.0 & FAILSAFE = False                 |
|   * ctypes Windows APIs (Screen Off, Wake, Suspend, Lock)    |
|   * pycaw (Audio & Mute) + screen-brightness-control         |
+--------------------------------------------------------------+
```

---

## 📱 V2.0 PRO Mobile Interface Capabilities

### 1. Control Tab (Home)
- **Live Status Pill**: Online/Offline pulse, CPU % bar, RAM % bar, Battery % with charging bolt.
- **Power & Display Grid**:
  - `Lock PC` (immediate workstation lock via `LockWorkStation`)
  - `Sleep` (suspend system via `SetSuspendState`)
  - `Screen Off` (turn display off without sleep via `SC_MONITORPOWER, 2`)
  - `Wake Screen` (nudge cursor & pulse wake signal)
  - `Restart` (with safety confirmation dialog)
  - `Shutdown` (with safety confirmation dialog)
- **Interactive Live Screen Card**:
  - `Capture View`: Grabs Dell screen and uploads to Supabase storage.
  - **Tap-to-Click Modal**: Touching anywhere on the captured screen image maps relative `(x%, y%)` coordinates to exact Dell screen pixels and fires a click with immediate visual ripple feedback!

### 2. Trackpad Tab (Mouse & Keyboard)
- **Full-Width Glass Touchpad** (`touch-action: none`):
  - 1-finger drag: Smooth mouse cursor movement throttled at ~35ms over WebSockets.
  - 1-finger tap: Left click.
  - 2-finger tap: Right click.
  - Double-tap & hold: Mouse down (Drag & drop mode), releases on touch end.
- **Vertical Scroll Strip**: Dedicated strip on right edge for scrolling up and down.
- **Dedicated Buttons**: `L-CLICK`, `DBL-CLICK`, and `R-CLICK`.
- **Mouse Sensitivity Slider**: Real-time adjustment from 0.6x to 2.5x.
- **Remote Keyboard Bar**:
  - Text input with instant injection onto Dell (Unicode & Khmer fully supported via clipboard fallback).
  - Quick shortcut chips: `Enter`, `Backspace`, `Esc`, `Tab`, `Win`, `Alt+Tab`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `↑`, `↓`, `←`, `→`.

### 3. Launcher & Media Tab
- **Quick App Launcher**:
  - Launch `Chrome`, `YouTube`, `File Explorer`, `Task Manager`, `Notepad`, `Calculator`, `VS Code / IDE`.
  - Custom "Open URL or App Name" bar with instant Launch button.
- **Boss Key / Privacy Button**: One tap minimizes all windows (`Win+D`) and mutes audio immediately.
- **Media & Hardware Deck**:
  - Smooth Master Volume Slider (0-100%) + live mute toggle.
  - Screen Brightness Slider (0-100%).
  - Media playback controls: `Prev`, `Play / Pause`, `Next`.
- **Window Controls**: `Alt+Tab (Switch App)`, `Minimize`, `Maximize`, `Close Active (Alt+F4)`.

### 4. Tools Tab
- **2-Way Clipboard Sync**:
  - "Push to Dell": Paste or type text on phone and push directly into Dell clipboard.
  - "Pull from Dell": Fetches Dell's current clipboard text directly to phone screen with a one-tap "Copy to Phone" button.
- **Live Process Manager (RAM Saver)**:
  - Scans top 8 memory-heavy processes on Dell.
  - Displays Process Name, PID, and RAM usage in MB.
  - One-tap `Kill` button on individual heavy/frozen processes.
  - `Clean >500MB` button to automatically clean heavy Chrome/Node processes.
- **Remote Alert / Find PC**:
  - Type message to pop up a Windows notification box and speak it aloud via Windows SAPI Speech Synthesizer (TTS).
- **Command Audit Log**: Expandable history drawer tracking database commands and execution status.

---

## 📋 PART 1: Supabase Setup (SQL & Storage)

Paste this into your **[Supabase SQL Editor](https://supabase.com/dashboard)**:

```sql
-- 1. Create table for device telemetry
create table if not exists public.device_telemetry (
    id integer primary key default 1,
    device_name text not null default 'Dell Latitude 7490',
    cpu_percent double precision default 0,
    ram_percent double precision default 0,
    battery_percent double precision default 100,
    is_charging boolean default false,
    screenshot_url text,
    updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- 2. Create table for device commands
create table if not exists public.device_commands (
    id bigint generated by default as identity primary key,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    command text not null,
    payload text,
    status text not null default 'pending',
    executed_at timestamptz,
    error_message text
);

-- 3. High-speed index
create index if not exists idx_device_commands_status_created 
on public.device_commands (status, created_at asc);

-- 4. Enable RLS & Grants
alter table public.device_telemetry enable row level security;
alter table public.device_commands enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.device_telemetry to anon, authenticated, service_role;
grant all on table public.device_commands to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- 5. Policies
create policy "Allow all telemetry operations" on public.device_telemetry for all using (true) with check (true);
create policy "Allow all command operations" on public.device_commands for all using (true) with check (true);

-- 6. Enable Realtime Publications
alter publication supabase_realtime add table public.device_telemetry;
alter publication supabase_realtime add table public.device_commands;

-- 7. Initialize Dell baseline record
insert into public.device_telemetry (id, device_name, cpu_percent, ram_percent, battery_percent, is_charging, updated_at)
values (1, 'Dell Latitude 7490', 0, 0, 100, false, now())
on conflict (id) do nothing;
```

### Storage Bucket Setup
1. In Supabase Dashboard -> **Storage** -> **Create bucket**.
2. Name: `screenshots`
3. Set **Public bucket**: **ON**
4. Under Policies: Allow `SELECT`, `INSERT`, `UPDATE`, `DELETE` for `anon` and `authenticated`.

---

## 💻 PART 2: Running the Windows Agent

1. Install Python dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

2. Verify `.env` file exists with credentials:
   ```env
   SUPABASE_URL=https://xjtrrrmgbwvhiqxcimft.supabase.co
   SUPABASE_KEY=sb_publishable_IcfxlawxuvtKarv17wBkYQ_7akxV-F4
   DEVICE_ID=1
   DEVICE_NAME=Dell Latitude 7490
   TELEMETRY_INTERVAL=5
   STORAGE_BUCKET=screenshots
   ```

3. Start agent:
   ```powershell
   python pc_agent.py
   ```

---

## 🌐 PART 3: Deploying Web Remote to Vercel

```powershell
cd web-remote
npm run build
npx vercel --prod --yes `
  -b NEXT_PUBLIC_SUPABASE_URL="https://xjtrrrmgbwvhiqxcimft.supabase.co" `
  -b NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_IcfxlawxuvtKarv17wBkYQ_7akxV-F4" `
  -b NEXT_PUBLIC_ACCESS_PIN="123456" `
  -e NEXT_PUBLIC_SUPABASE_URL="https://xjtrrrmgbwvhiqxcimft.supabase.co" `
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_IcfxlawxuvtKarv17wBkYQ_7akxV-F4" `
  -e NEXT_PUBLIC_ACCESS_PIN="123456"
```
Production URL: **https://web-remote-flax.vercel.app**
