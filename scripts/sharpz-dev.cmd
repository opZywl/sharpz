@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
call "%~dp0languages\load.cmd"
title !T_TITLE_DEV!

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

set "WVENV=%ROOT%\whisper-venv"
set "WPY=%WVENV%\Scripts\python.exe"
set "BVENV=%ROOT%\venv"
set "BPY=%BVENV%\Scripts\python.exe"
set "API_URL=http://127.0.0.1:8000/api/health"
set "WEB_URL=http://localhost:5174"

set "ESC="
for /f %%E in ('echo prompt $E ^| cmd') do set "ESC=%%E"
set "C_RESET=%ESC%[0m"
set "C_GREEN=%ESC%[92m"
set "C_RED=%ESC%[91m"
set "C_YEL=%ESC%[93m"
set "C_CYAN=%ESC%[96m"
set "C_BOLD=%ESC%[1m"

echo.
echo %C_BOLD%%C_CYAN%====================================================%C_RESET%
echo %C_BOLD%%C_CYAN%   !T_HEADER_DEV!%C_RESET%
echo %C_BOLD%%C_CYAN%====================================================%C_RESET%
echo.

echo %C_CYAN%[1/7] !T_CHECKING_PREREQS!%C_RESET%

where node >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] Node.js !T_NOT_ON_PATH!%C_RESET%
  echo %C_YEL%      !T_INSTALL_NODE!%C_RESET%
  goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo %C_GREEN%  [ok] Node %NODE_VER%%C_RESET%

call :ensure_tool uv
if errorlevel 1 (
  echo %C_RED%  [x] uv !T_NOT_ON_PATH!%C_RESET%
  echo %C_YEL%      !T_INSTALL_WITH!  winget install --id=astral-sh.uv -e%C_RESET%
  echo %C_YEL%      !T_NEW_TERMINAL!%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] uv !T_AVAILABLE!%C_RESET%

call :ensure_tool ffmpeg
if errorlevel 1 (
  echo %C_RED%  [x] ffmpeg !T_NOT_ON_PATH!%C_RESET%
  echo %C_YEL%      !T_INSTALL_WITH!  winget install --id=Gyan.FFmpeg -e%C_RESET%
  echo %C_YEL%      !T_NEW_TERMINAL!%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] ffmpeg !T_AVAILABLE!%C_RESET%
echo.

echo %C_CYAN%[2/7] !T_ENGINE_DEV!%C_RESET%
if not exist "%WPY%" (
  echo %C_YEL%  !T_WVENV_MISSING!%C_RESET%
  uv venv "%WVENV%" --python 3.12
  if errorlevel 1 (
    echo %C_RED%  [x] !T_WVENV_FAILED!%C_RESET%
    goto :fail
  )
) else (
  echo %C_GREEN%  [ok] whisper-venv !T_ALREADY_EXISTS!%C_RESET%
)

echo %C_CYAN%  !T_INSTALLING! faster-whisper...%C_RESET%
uv pip install -p "%WPY%" faster-whisper
if errorlevel 1 (
  echo %C_RED%  [x] !T_INSTALL_FAILED! faster-whisper.%C_RESET%
  goto :fail
)

echo %C_CYAN%  !T_INSTALLING! !T_TORCH_CPU!%C_RESET%
uv pip install -p "%WPY%" torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 (
  echo %C_RED%  [x] !T_INSTALL_FAILED! torch/torchaudio.%C_RESET%
  goto :fail
)

echo %C_CYAN%  !T_INSTALLING! !T_WHISPERX_EXTRA!%C_RESET%
uv pip install -p "%WPY%" whisperx imageio-ffmpeg
if errorlevel 1 (
  echo %C_YEL%  [*] !T_WHISPERX_FAILED!%C_RESET%
) else (
  echo %C_GREEN%  [ok] whisperX !T_INSTALLED!%C_RESET%
)
echo.

echo %C_CYAN%[3/7] !T_BACKEND_DEV!%C_RESET%
if not exist "%BPY%" (
  echo %C_YEL%  !T_VENV_MISSING!%C_RESET%
  python -m venv "%BVENV%"
  if errorlevel 1 (
    echo %C_RED%  [x] !T_VENV_FAILED!%C_RESET%
    goto :fail
  )
  echo %C_CYAN%  !T_BACKEND_DEPS!%C_RESET%
  "%BPY%" -m pip install --upgrade pip
  "%BPY%" -m pip install -r "%ROOT%\requirements.txt" -c "%ROOT%\constraints.txt"
  if errorlevel 1 (
    echo %C_RED%  [x] !T_REQUIREMENTS_FAILED!%C_RESET%
    goto :fail
  )
) else (
  echo %C_GREEN%  [ok] !T_VENV_EXISTS!%C_RESET%
)

echo %C_CYAN%  !T_STARTING_SERVER!%C_RESET%
start "Sharpz API" cmd /c ""%BPY%" "%ROOT%\server.py" > "%ROOT%\fastapi.log" 2> "%ROOT%\fastapi.err.log""

echo %C_CYAN%  !T_WAITING_HEALTH! %API_URL% ...%C_RESET%
set "API_OK="
for /l %%i in (1,1,60) do (
  if not defined API_OK (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%API_URL%' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 (
      set "API_OK=1"
    ) else (
      <nul set /p "=."
      powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul
    )
  )
)
echo.
if not defined API_OK (
  echo %C_RED%  [x] !T_BACKEND_TIMEOUT! %API_URL%%C_RESET%
  echo %C_YEL%      !T_SEE_LOG! !ROOT!\fastapi.err.log%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] !T_BACKEND_UP! http://127.0.0.1:8000%C_RESET%
echo.

echo %C_CYAN%[4/7] !T_DASHBOARD_DEV!%C_RESET%
if not exist "%ROOT%\web\node_modules" (
  echo %C_YEL%  !T_NODE_MODULES_MISSING!%C_RESET%
  pushd "%ROOT%\web"
  call npm install
  set "NPM_RC=!errorlevel!"
  popd
  if not "!NPM_RC!"=="0" (
    echo %C_RED%  [x] !T_NPM_INSTALL_FAILED!%C_RESET%
    goto :fail
  )
) else (
  echo %C_GREEN%  [ok] !T_NODE_MODULES_EXISTS!%C_RESET%
)

echo %C_CYAN%  !T_STARTING_WEB_DEV!%C_RESET%
start "Sharpz Web" cmd /c "cd /d "%ROOT%\web" && npm run dev > "%ROOT%\next.log" 2> "%ROOT%\next.err.log""

echo %C_CYAN%  !T_WAITING_FOR! %WEB_URL% ...%C_RESET%
set "WEB_OK="
for /l %%i in (1,1,60) do (
  if not defined WEB_OK (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%WEB_URL%' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 (
      set "WEB_OK=1"
    ) else (
      <nul set /p "=."
      powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul
    )
  )
)
echo.
if not defined WEB_OK (
  echo %C_RED%  [x] !T_DASHBOARD_TIMEOUT! %WEB_URL%%C_RESET%
  echo %C_YEL%      !T_SEE_LOG! !ROOT!\next.err.log%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] !T_DASHBOARD_UP! %WEB_URL%%C_RESET%
echo.

echo %C_CYAN%[5/7] !T_SERVICE_STATUS!%C_RESET%
echo %C_GREEN%  [200] API       : http://127.0.0.1:8000/api/health%C_RESET%
echo %C_GREEN%  [200] !T_LABEL_DASHBOARD! : %WEB_URL%%C_RESET%
echo.

echo %C_CYAN%[6/7] !T_OPENING_CHROME!%C_RESET%
start chrome "%WEB_URL%"
if errorlevel 1 (
  echo %C_YEL%  [*] !T_CHROME_FAILED!%C_RESET%
  echo %C_YEL%      !T_OPEN_MANUALLY! %WEB_URL%%C_RESET%
) else (
  echo %C_GREEN%  [ok] !T_CHROME_OPENED! %WEB_URL%%C_RESET%
)
echo.

echo %C_CYAN%[7/7] !T_ALL_SET!%C_RESET%
echo.
echo %C_BOLD%%C_GREEN%====================================================%C_RESET%
echo %C_BOLD%  !T_RUNNING!%C_RESET%
echo %C_GREEN%    !T_LABEL_DASHBOARD! : %WEB_URL%%C_RESET%
echo %C_GREEN%    API       : http://127.0.0.1:8000%C_RESET%
echo.
echo %C_YEL%  !T_HOW_TO_STOP!%C_RESET%
echo %C_YEL%    !T_CLOSE_WINDOWS!%C_RESET%
echo %C_YEL%    !T_OR_RUN!%C_RESET%
echo %C_YEL%      taskkill /FI "WINDOWTITLE eq Sharpz API" /T /F%C_RESET%
echo %C_YEL%      taskkill /FI "WINDOWTITLE eq Sharpz Web" /T /F%C_RESET%
echo.
echo %C_YEL%  !T_FIRST_RUN_NOTE_1!%C_RESET%
echo %C_YEL%  !T_FIRST_RUN_NOTE_2!%C_RESET%
echo %C_BOLD%%C_GREEN%====================================================%C_RESET%
echo.
goto :end

:ensure_tool
where %1 >nul 2>nul
if not errorlevel 1 exit /b 0
for /f "usebackq tokens=2,*" %%a in (`reg query "HKCU\Environment" /v Path 2^>nul ^| findstr /i "Path"`) do set "USERPATH=%%b"
for /f "usebackq tokens=2,*" %%a in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /i "Path"`) do set "MACHINEPATH=%%b"
set "PATH=%MACHINEPATH%;%USERPATH%;%PATH%"
where %1 >nul 2>nul
if not errorlevel 1 exit /b 0
exit /b 1

:fail
echo.
echo %C_RED%%C_BOLD%!T_DEV_FAILED!%C_RESET%
echo.
pause
exit /b 1

:end
pause
exit /b 0
