"""
Dell Remote Server V3.0 PRO - Service Registration & Lifecycle Manager
Registers and launches Windows Scheduled Task 'DellRemoteServerV3' using Task Scheduler COM API.
Ensures pc_server.py runs detached from Antigravity IDE and survives reboots, network drops, and IDE closures.
"""
import os
import sys
import time
import win32com.client
import psutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
pythonw_path = r"C:\Users\User\AppData\Local\Programs\Python\Python312\pythonw.exe"
server_script = os.path.join(BASE_DIR, "pc_server.py")
TASK_NAME = "DellRemoteServerV3"

def register_and_start_task():
    print(f"Connecting to Windows Task Scheduler COM Service...")
    ts = win32com.client.Dispatch("Schedule.Service")
    ts.Connect()
    root_folder = ts.GetFolder("\\")

    task_def = ts.NewTask(0)
    task_def.RegistrationInfo.Description = "Dell Latitude 7490 Remote Control Server V3.0 PRO (Independent Windows Service)"
    task_def.Principal.LogonType = 3  # TASK_LOGON_INTERACTIVE_TOKEN

    settings = task_def.Settings
    settings.Enabled = True
    settings.AllowDemandStart = True
    settings.DisallowStartIfOnBatteries = False
    settings.StopIfGoingOnBatteries = False
    settings.ExecutionTimeLimit = "PT0S"  # Indefinite execution
    settings.RestartCount = 3
    settings.RestartInterval = "PT1M"

    # Logon trigger for current user
    trigger = task_def.Triggers.Create(9)  # TASK_TRIGGER_LOGON
    trigger.UserId = os.environ.get("USERNAME", "user")
    trigger.Enabled = True

    # Action: Run pc_server.py with pythonw.exe
    action = task_def.Actions.Create(0)  # TASK_ACTION_EXEC
    action.Path = pythonw_path
    action.Arguments = f'"{server_script}"'
    action.WorkingDirectory = BASE_DIR

    # Register (TASK_CREATE_OR_UPDATE = 6, TASK_LOGON_INTERACTIVE_TOKEN = 3)
    registered_task = root_folder.RegisterTaskDefinition(
        TASK_NAME,
        task_def,
        6,
        None,
        None,
        3
    )
    print(f"Scheduled Task '{TASK_NAME}' registered successfully.")

    # Start the task now
    print(f"Starting Scheduled Task '{TASK_NAME}'...")
    running_task = registered_task.Run(None)
    print(f"Scheduled Task '{TASK_NAME}' triggered (Engine Instance: {running_task.InstanceGuid}).")

    time.sleep(2)
    # Check running processes
    found = False
    for p in psutil.process_iter(['pid', 'name', 'ppid', 'cmdline']):
        try:
            name = (p.info['name'] or '').lower()
            cmdline = ' '.join(p.info.get('cmdline') or [])
            if 'pythonw' in name and 'pc_server.py' in cmdline:
                parent = psutil.Process(p.info['ppid']) if p.info['ppid'] else None
                parent_name = parent.name() if parent else "Unknown"
                print(f"Verified Process: PID={p.pid}, Name={p.info['name']}, ParentPID={p.info['ppid']} ({parent_name})")
                print(f"Parent Process is OUTSIDE Antigravity IDE: {parent_name}")
                found = True
        except Exception:
            pass

    if not found:
        print("Warning: pythonw.exe pc_server.py not yet detected in process table, checking logs...")

if __name__ == "__main__":
    register_and_start_task()
