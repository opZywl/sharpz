@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Sharpz - Modo PRODUCAO

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
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
echo %C_BOLD%%C_CYAN%   Sharpz - Modo PRODUCAO (build otimizado + serve)%C_RESET%
echo %C_BOLD%%C_CYAN%==========================================================%C_RESET%
echo.

echo %C_CYAN%[1/7] Verificando pre-requisitos...%C_RESET%

call :refresh_path

where node >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] Node nao encontrado. Rode sharpz-setup.cmd primeiro.%C_RESET%
  goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo %C_GREEN%  [ok] Node %NODE_VER%%C_RESET%

if not exist "%BPY%" (
  echo %C_RED%  [x] venv do backend nao encontrado em %BPY%.%C_RESET%
  echo %C_RED%      Rode sharpz-setup.cmd primeiro.%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] venv do backend disponivel%C_RESET%
echo.

echo %C_CYAN%[2/7] Frontend (web, dependencias)...%C_RESET%
if not exist "%ROOT%\web\node_modules" (
  echo %C_YEL%  node_modules ausente. Rodando npm install...%C_RESET%
  pushd "%ROOT%\web"
  call npm install
  set "NPM_RC=!errorlevel!"
  popd
  if not "!NPM_RC!"=="0" ( echo %C_RED%  [x] Falha no npm install.%C_RESET% & goto :fail )
) else (
  echo %C_GREEN%  [ok] node_modules ja existe%C_RESET%
)
echo.

echo %C_CYAN%[3/7] Encerrando instancias anteriores nas portas 8000 e 5174 (antes do build, evita corromper o .next)...%C_RESET%
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do taskkill /F /PID %%p >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5174"') do taskkill /F /PID %%p >nul 2>nul
echo %C_GREEN%  [ok] portas liberadas%C_RESET%
echo.

echo %C_CYAN%[4/7] Limpando build anterior (.next)...%C_RESET%
if exist "%ROOT%\web\.next" (
  rmdir /s /q "%ROOT%\web\.next"
  echo %C_GREEN%  [ok] .next removido%C_RESET%
) else (
  echo %C_GREEN%  [ok] nada para limpar%C_RESET%
)
echo.

echo %C_CYAN%[5/7] Build de producao (npm run build)...%C_RESET%
pushd "%ROOT%\web"
call npm run build
set "BUILD_RC=!errorlevel!"
popd
if not "!BUILD_RC!"=="0" (
  echo %C_RED%  [x] Build de producao falhou. Veja a saida acima.%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] build otimizado gerado%C_RESET%
echo.

echo %C_CYAN%[6/7] Subindo o backend na porta 8000...%C_RESET%
start "Sharpz API" cmd /c ""%BPY%" "%ROOT%\server.py" > "%ROOT%\fastapi.log" 2> "%ROOT%\fastapi.err.log""
echo %C_CYAN%  Aguardando healthcheck em %API_URL% ...%C_RESET%
set "API_OK="
for /l %%i in (1,1,60) do (
  if not defined API_OK (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%API_URL%' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 ( set "API_OK=1" ) else ( <nul set /p "=." & powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul )
  )
)
echo.
if not defined API_OK ( echo %C_RED%  [x] Backend nao respondeu. Veja %ROOT%\fastapi.err.log%C_RESET% & goto :fail )
echo %C_GREEN%  [ok] Backend respondendo em http://127.0.0.1:8000%C_RESET%
echo.

echo %C_CYAN%[7/7] Subindo o frontend PROD na porta 5174 (npm run start)...%C_RESET%
start "Sharpz Web (prod)" cmd /c "cd /d "%ROOT%\web" && npm run start > "%ROOT%\next.log" 2> "%ROOT%\next.err.log""
echo %C_CYAN%  Aguardando %WEB_URL% ...%C_RESET%
set "WEB_OK="
for /l %%i in (1,1,60) do (
  if not defined WEB_OK (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%WEB_URL%' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 ( set "WEB_OK=1" ) else ( <nul set /p "=." & powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul )
  )
)
echo.
if not defined WEB_OK ( echo %C_RED%  [x] Frontend nao respondeu. Veja %ROOT%\next.err.log%C_RESET% & goto :fail )
echo %C_GREEN%  [ok] Frontend respondendo em %WEB_URL%%C_RESET%
echo.

echo %C_CYAN%Abrindo o dashboard no Chrome...%C_RESET%
start chrome "%WEB_URL%"
echo.
echo %C_BOLD%%C_GREEN%==========================================================%C_RESET%
echo %C_BOLD%  Sharpz rodando em MODO PRODUCAO (build otimizado):%C_RESET%
echo %C_GREEN%    Dashboard : %WEB_URL%%C_RESET%
echo %C_GREEN%    API       : http://127.0.0.1:8000%C_RESET%
echo.
echo %C_YEL%  Parar: feche as janelas "Sharpz API" e "Sharpz Web (prod)".%C_RESET%
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
echo %C_RED%%C_BOLD%Modo producao interrompido por erro. Corrija o item acima e rode novamente.%C_RESET%
echo.
pause
exit /b 1

:end
echo %C_CYAN%Pode fechar esta janela; os servicos seguem nas janelas Sharpz API / Sharpz Web (prod).%C_RESET%
pause
exit /b 0
