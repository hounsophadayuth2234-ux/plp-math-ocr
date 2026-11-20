"""
Dell Remote Server V3.0 PRO - Silent Detached Launcher
Runs pc_server.py using pythonw.exe completely detached from console or IDE.
"""
import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

python_dir = os.path.dirname(sys.executable)
pythonw_path = os.path.join(python_dir, "pythonw.exe")
if not os.path.exists(pythonw_path):
    pythonw_path = sys.executable

server_script = os.path.join(BASE_DIR, "pc_server.py")

# Windows flags for total detachment and zero window
DETACHED_PROCESS = 0x00000008
CREATE_NO_WINDOW = 0x08000000
flags = DETACHED_PROCESS | CREATE_NO_WINDOW

subprocess.Popen(
    [pythonw_path, server_script],
    cwd=BASE_DIR,
    creationflags=flags,
    close_fds=True
)
