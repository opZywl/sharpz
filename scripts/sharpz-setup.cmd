@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
call "%~dp0languages\load.cmd"
title !T_TITLE_SETUP!

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

set "WVENV=%ROOT%\whisper-venv"
set "WPY=%WVENV%\Scripts\python.exe"
set "BVENV=%ROOT%\venv"
set "BPY=%BVENV%\Scripts\python.exe"
set "API_URL=http://127.0.0.1:8000/api/health"
set "WEB_URL=http://localhost:5174"

set "HF_HUB_DISABLE_XET=1"
set "HF_HUB_DISABLE_SYMLINKS_WARNING=1"

set "C_RESET="
set "C_GREEN="
set "C_RED="
set "C_YEL="
set "C_CYAN="
set "C_BOLD="

echo.
echo %C_BOLD%%C_CYAN%==========================================================%C_RESET%
echo %C_BOLD%%C_CYAN%   !T_HEADER_SETUP!%C_RESET%
echo %C_BOLD%%C_CYAN%==========================================================%C_RESET%
echo.

echo %C_CYAN%[1/8] !T_CHECKING_INSTALLING_PREREQS!%C_RESET%

call :refresh_path

where node >nul 2>nul
if errorlevel 1 (
  echo %C_YEL%  Node !T_NOT_FOUND_WINGET!%C_RESET%
  winget install --id=OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :refresh_path
)
where node >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] Node !T_STILL_MISSING_NODE!%C_RESET%
  goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo %C_GREEN%  [ok] Node %NODE_VER%%C_RESET%

where uv >nul 2>nul
if errorlevel 1 (
  echo %C_YEL%  uv !T_NOT_FOUND_WINGET!%C_RESET%
  winget install --id=astral-sh.uv -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :refresh_path
)
where uv >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] uv !T_STILL_MISSING_WITH! winget install --id=astral-sh.uv -e%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] uv !T_AVAILABLE!%C_RESET%

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo %C_YEL%  ffmpeg !T_NOT_FOUND_WINGET!%C_RESET%
  winget install --id=Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :refresh_path
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] ffmpeg !T_STILL_MISSING_WITH! winget install --id=Gyan.FFmpeg -e%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] ffmpeg !T_AVAILABLE!%C_RESET%
echo.

echo %C_CYAN%[2/8] !T_ENGINE_SETUP!%C_RESET%
if not exist "%WPY%" (
  echo %C_YEL%  !T_CREATING_WVENV!%C_RESET%
  uv venv "%WVENV%" --python 3.12
  if errorlevel 1 ( echo %C_RED%  [x] !T_WVENV_FAILED!%C_RESET% & goto :fail )
) else (
  echo %C_GREEN%  [ok] whisper-venv !T_ALREADY_EXISTS!%C_RESET%
)
echo %C_CYAN%  !T_INSTALLING! faster-whisper...%C_RESET%
uv pip install -p "%WPY%" faster-whisper
if errorlevel 1 ( echo %C_RED%  [x] !T_INSTALL_FAILED! faster-whisper.%C_RESET% & goto :fail )
echo %C_CYAN%  !T_INSTALLING! !T_TORCH_CPU!%C_RESET%
uv pip install -p "%WPY%" torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 ( echo %C_RED%  [x] !T_INSTALL_FAILED! torch.%C_RESET% & goto :fail )
echo %C_CYAN%  !T_INSTALLING! !T_WHISPERX_EXTRA!%C_RESET%
uv pip install -p "%WPY%" whisperx imageio-ffmpeg
if errorlevel 1 (
  echo %C_YEL%  [*] !T_WHISPERX_FAILED!%C_RESET%
) else (
  echo %C_GREEN%  [ok] whisperX !T_INSTALLED!%C_RESET%
)
echo.

echo %C_CYAN%[3/8] !T_BACKEND_SETUP!%C_RESET%
if not exist "%BPY%" (
  echo %C_YEL%  !T_CREATING_VENV!%C_RESET%
  python -m venv "%BVENV%"
  if errorlevel 1 ( echo %C_RED%  [x] !T_VENV_FAILED!%C_RESET% & goto :fail )
)
echo %C_CYAN%  !T_BACKEND_DEPS!%C_RESET%
"%BPY%" -m pip install --upgrade pip >nul 2>nul
"%BPY%" -m pip install -r "%ROOT%\requirements.txt" -c "%ROOT%\constraints.txt"
if errorlevel 1 ( echo %C_RED%  [x] !T_REQUIREMENTS_FAILED!%C_RESET% & goto :fail )
"%BPY%" -m pip install yt-dlp
if errorlevel 1 ( echo %C_YEL%  [*] !T_YTDLP_FAILED!%C_RESET% )
echo %C_GREEN%  [ok] !T_BACKEND_READY!%C_RESET%
echo.

echo %C_CYAN%[4/8] !T_MODEL_PREFETCH!%C_RESET%
"%WPY%" "%ROOT%\tools\download_model.py" large-v3-turbo
if errorlevel 1 (
  echo %C_YEL%  [*] !T_MODEL_PREFETCH_FAILED!%C_RESET%
) else (
  echo %C_GREEN%  [ok] !T_MODEL_READY!%C_RESET%
)
echo   !T_MODEL_LARGE_HINT!
echo.

echo %C_CYAN%[5/8] !T_DASHBOARD_NPM!%C_RESET%
if not exist "%ROOT%\web\node_modules" (
  pushd "%ROOT%\web"
  call npm install
  set "NPM_RC=!errorlevel!"
  popd
  if not "!NPM_RC!"=="0" ( echo %C_RED%  [x] !T_NPM_INSTALL_FAILED!%C_RESET% & goto :fail )
) else (
  echo %C_GREEN%  [ok] !T_NODE_MODULES_EXISTS!%C_RESET%
)
echo.

echo !T_STOPPING_PORTS!
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do taskkill /F /PID %%p >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5174"') do taskkill /F /PID %%p >nul 2>nul
echo.

echo %C_CYAN%[6/8] !T_STARTING_BACKEND!%C_RESET%
start "Sharpz API" cmd /c ""%BPY%" "%ROOT%\server.py" > "%ROOT%\fastapi.log" 2> "%ROOT%\fastapi.err.log""
echo %C_CYAN%  !T_WAITING_HEALTH! %API_URL% ...%C_RESET%
set "API_OK="
for /l %%i in (1,1,60) do (
  if not defined API_OK (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%API_URL%' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 ( set "API_OK=1" ) else ( <nul set /p "=." & powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul )
  )
)
echo.
if not defined API_OK ( echo %C_RED%  [x] !T_BACKEND_DOWN! !ROOT!\fastapi.err.log%C_RESET% & goto :fail )
echo %C_GREEN%  [ok] !T_BACKEND_UP! http://127.0.0.1:8000%C_RESET%
echo.

echo %C_CYAN%[7/8] !T_STARTING_DASHBOARD!%C_RESET%
start "Sharpz Web" cmd /c "cd /d "%ROOT%\web" && npm run dev > "%ROOT%\next.log" 2> "%ROOT%\next.err.log""
echo %C_CYAN%  !T_WAITING_FOR! %WEB_URL% ...%C_RESET%
set "WEB_OK="
for /l %%i in (1,1,60) do (
  if not defined WEB_OK (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%WEB_URL%' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 ( set "WEB_OK=1" ) else ( <nul set /p "=." & powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul )
  )
)
echo.
if not defined WEB_OK ( echo %C_RED%  [x] !T_DASHBOARD_DOWN! !ROOT!\next.err.log%C_RESET% & goto :fail )
echo %C_GREEN%  [ok] !T_DASHBOARD_UP! %WEB_URL%%C_RESET%
echo.

echo %C_CYAN%[8/8] !T_OPENING_CHROME!%C_RESET%
start chrome "%WEB_URL%"
echo.
echo %C_BOLD%%C_GREEN%==========================================================%C_RESET%
echo %C_BOLD%  !T_RUNNING!%C_RESET%
echo %C_GREEN%    !T_LABEL_DASHBOARD! : %WEB_URL%%C_RESET%
echo %C_GREEN%    API       : http://127.0.0.1:8000%C_RESET%
echo.
echo %C_YEL%  !T_DIARIZATION_TERMS!%C_RESET%
echo %C_YEL%    https://huggingface.co/pyannote/speaker-diarization-community-1%C_RESET%
echo %C_YEL%  !T_STOP_HINT!%C_RESET%
echo %C_BOLD%%C_GREEN%==========================================================%C_RESET%
echo.
goto :end

:refresh_path
for /f "usebackq tokens=2,*" %%a in (`reg query "HKCU\Environment" /v Path 2^>nul ^| findstr /i "Path"`) do set "USERPATH=%%b"
for /f "usebackq tokens=2,*" %%a in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /i "Path"`) do set "MACHINEPATH=%%b"
set "PATH=%MACHINEPATH%;%USERPATH%;%PATH%"
exit /b 0

:fail
echo.
echo %C_RED%%C_BOLD%!T_SETUP_FAILED!%C_RESET%
echo.
pause
exit /b 1

:end
echo %C_CYAN%!T_KEEP_RUNNING!%C_RESET%
pause
exit /b 0
