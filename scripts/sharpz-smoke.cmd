@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
call "%~dp0languages\load.cmd"

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "BPY=%ROOT%\venv\Scripts\python.exe"

if not exist "%BPY%" (
    echo !T_SMOKE_NO_PYTHON!
    echo        !BPY!
    echo        !T_RUN_INSTALL_FIRST!
    pause
    exit /b 1
)

echo !T_SMOKE_CHECKING!
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:8000/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
    echo !T_SMOKE_OFFLINE!
    pause
    exit /b 1
)

echo !T_SMOKE_RUNNING!
echo.
"%BPY%" "%ROOT%\tests\smoke.py"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo !T_SMOKE_PASSED!
) else (
    echo !T_SMOKE_FAILED! !RC!
)

pause
exit /b %RC%
