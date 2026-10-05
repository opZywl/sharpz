@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
call "%~dp0languages\load.cmd"
title !T_TITLE_PROD!

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

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
echo %C_BOLD%%C_CYAN%   !T_HEADER_PROD!%C_RESET%
echo %C_BOLD%%C_CYAN%==========================================================%C_RESET%
echo.

echo %C_CYAN%[1/7] !T_CHECKING_PREREQS!%C_RESET%

call :refresh_path

where node >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] !T_NODE_NOT_FOUND! !T_RUN_INSTALL_FIRST!%C_RESET%
  goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo %C_GREEN%  [ok] Node %NODE_VER%%C_RESET%

if not exist "%BPY%" (
  echo %C_RED%  [x] !T_VENV_NOT_FOUND! !BPY!%C_RESET%
  echo %C_RED%      !T_RUN_INSTALL_FIRST!%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] !T_VENV_AVAILABLE!%C_RESET%
echo.

echo %C_CYAN%[2/7] !T_DASHBOARD_DEPS!%C_RESET%
if not exist "%ROOT%\web\node_modules" (
  echo %C_YEL%  !T_NODE_MODULES_MISSING!%C_RESET%
  pushd "%ROOT%\web"
  call npm install
  set "NPM_RC=!errorlevel!"
  popd
  if not "!NPM_RC!"=="0" ( echo %C_RED%  [x] !T_NPM_INSTALL_FAILED!%C_RESET% & goto :fail )
) else (
  echo %C_GREEN%  [ok] !T_NODE_MODULES_EXISTS!%C_RESET%
)
echo.

echo %C_CYAN%[3/7] !T_STOPPING_PORTS_BUILD!%C_RESET%
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do taskkill /F /PID %%p >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5174"') do taskkill /F /PID %%p >nul 2>nul
echo %C_GREEN%  [ok] !T_PORTS_RELEASED!%C_RESET%
echo.

echo %C_CYAN%[4/7] !T_CLEANING_BUILD!%C_RESET%
if exist "%ROOT%\web\.next" (
  rmdir /s /q "%ROOT%\web\.next"
  echo %C_GREEN%  [ok] !T_NEXT_REMOVED!%C_RESET%
) else (
  echo %C_GREEN%  [ok] !T_NOTHING_TO_CLEAN!%C_RESET%
)
echo.

echo %C_CYAN%[5/7] !T_PROD_BUILD!%C_RESET%
pushd "%ROOT%\web"
call npm run build
set "BUILD_RC=!errorlevel!"
popd
if not "!BUILD_RC!"=="0" (
  echo %C_RED%  [x] !T_BUILD_FAILED!%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] !T_BUILD_READY!%C_RESET%
echo.

echo %C_CYAN%[6/7] !T_STARTING_BACKEND!%C_RESET%
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

echo %C_CYAN%[7/7] !T_STARTING_WEB_PROD!%C_RESET%
start "Sharpz Web (prod)" cmd /c "cd /d "%ROOT%\web" && npm run start > "%ROOT%\next.log" 2> "%ROOT%\next.err.log""
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

echo %C_CYAN%!T_OPENING_CHROME!%C_RESET%
start chrome "%WEB_URL%"
echo.
echo %C_BOLD%%C_GREEN%==========================================================%C_RESET%
echo %C_BOLD%  !T_RUNNING_PROD!%C_RESET%
echo %C_GREEN%    !T_LABEL_DASHBOARD! : %WEB_URL%%C_RESET%
echo %C_GREEN%    API       : http://127.0.0.1:8000%C_RESET%
echo.
echo %C_YEL%  !T_STOP_HINT_PROD!%C_RESET%
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
echo %C_RED%%C_BOLD%!T_PROD_FAILED!%C_RESET%
echo.
pause
exit /b 1

:end
echo %C_CYAN%!T_KEEP_RUNNING_PROD!%C_RESET%
pause
exit /b 0
