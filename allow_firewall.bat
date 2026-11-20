@echo off
echo =========================================================
echo Adding Windows Defender Firewall Inbound Rules for Port 8765
echo =========================================================
netsh advfirewall firewall add rule name="DellRemoteServerV3_8765" dir=in action=allow protocol=TCP localport=8765 profile=any
netsh advfirewall firewall add rule name="DellRemoteServerV3_Pythonw" dir=in action=allow program="C:\Users\User\AppData\Local\Programs\Python\Python312\pythonw.exe" profile=any
netsh advfirewall firewall add rule name="DellRemoteServerV3_Python" dir=in action=allow program="C:\Users\User\AppData\Local\Programs\Python\Python312\python.exe" profile=any
echo.
echo =========================================================
echo Verification:
echo =========================================================
netsh advfirewall firewall show rule name="DellRemoteServerV3_8765"
echo =========================================================
echo Firewall configuration complete!
echo =========================================================
pause
