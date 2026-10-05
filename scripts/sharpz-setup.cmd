@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Sharpz - Instalar

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
echo %C_BOLD%%C_CYAN%   Sharpz - Setup completo (do zero ate rodando)%C_RESET%
echo %C_BOLD%%C_CYAN%==========================================================%C_RESET%
echo.

echo %C_CYAN%[1/8] Verificando e instalando pre-requisitos...%C_RESET%

call :refresh_path

where node >nul 2>nul
if errorlevel 1 (
  echo %C_YEL%  Node nao encontrado. Instalando via winget...%C_RESET%
  winget install --id=OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :refresh_path
)
where node >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] Node continua ausente. Instale manualmente em https://nodejs.org e rode de novo.%C_RESET%
  goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo %C_GREEN%  [ok] Node %NODE_VER%%C_RESET%

where uv >nul 2>nul
if errorlevel 1 (
  echo %C_YEL%  uv nao encontrado. Instalando via winget...%C_RESET%
  winget install --id=astral-sh.uv -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :refresh_path
)
where uv >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] uv continua ausente. Instale com: winget install --id=astral-sh.uv -e%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] uv disponivel%C_RESET%

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo %C_YEL%  ffmpeg nao encontrado. Instalando via winget...%C_RESET%
  winget install --id=Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :refresh_path
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] ffmpeg continua ausente. Instale com: winget install --id=Gyan.FFmpeg -e%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] ffmpeg disponivel%C_RESET%
echo.

echo %C_CYAN%[2/8] Motor de transcricao (whisper-venv, Python 3.12)...%C_RESET%
if not exist "%WPY%" (
  echo %C_YEL%  Criando whisper-venv com Python 3.12 via uv...%C_RESET%
  uv venv "%WVENV%" --python 3.12
  if errorlevel 1 ( echo %C_RED%  [x] Falha ao criar whisper-venv.%C_RESET% & goto :fail )
) else (
  echo %C_GREEN%  [ok] whisper-venv ja existe%C_RESET%
)
echo %C_CYAN%  Instalando faster-whisper...%C_RESET%
uv pip install -p "%WPY%" faster-whisper
if errorlevel 1 ( echo %C_RED%  [x] Falha ao instalar faster-whisper.%C_RESET% & goto :fail )
echo %C_CYAN%  Instalando torch/torchaudio (indice CPU)...%C_RESET%
uv pip install -p "%WPY%" torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 ( echo %C_RED%  [x] Falha ao instalar torch.%C_RESET% & goto :fail )
echo %C_CYAN%  Instalando whisperX + imageio-ffmpeg (alinhamento/diarizacao)...%C_RESET%
uv pip install -p "%WPY%" whisperx imageio-ffmpeg
if errorlevel 1 (
  echo %C_YEL%  [!] whisperX falhou. Alinhamento/diarizacao ficam indisponiveis; transcricao basica segue.%C_RESET%
) else (
  echo %C_GREEN%  [ok] whisperX instalado%C_RESET%
)
echo.

echo %C_CYAN%[3/8] Backend FastAPI (venv)...%C_RESET%
if not exist "%BPY%" (
  echo %C_YEL%  Criando venv do backend com o Python do sistema...%C_RESET%
  python -m venv "%BVENV%"
  if errorlevel 1 ( echo %C_RED%  [x] Falha ao criar venv do backend. Python esta no PATH?%C_RESET% & goto :fail )
)
echo %C_CYAN%  Instalando dependencias do backend...%C_RESET%
"%BPY%" -m pip install --upgrade pip >nul 2>nul
"%BPY%" -m pip install -r "%ROOT%\requirements.txt"
if errorlevel 1 ( echo %C_RED%  [x] Falha ao instalar requirements.txt.%C_RESET% & goto :fail )
"%BPY%" -m pip install yt-dlp
if errorlevel 1 ( echo %C_YEL%  [!] yt-dlp falhou; entrada por URL/YouTube ficara indisponivel.%C_RESET% )
echo %C_GREEN%  [ok] backend pronto%C_RESET%
echo.

echo %C_CYAN%[4/8] Pre-baixando o modelo large-v3 (pode demorar, ~3GB; nao-fatal)...%C_RESET%
"%WPY%" "%ROOT%\tools\download_model.py" large-v3
if errorlevel 1 (
  echo %C_YEL%  [!] Nao consegui pre-baixar o large-v3 agora. Sera baixado na primeira transcricao.%C_RESET%
) else (
  echo %C_GREEN%  [ok] large-v3 pronto%C_RESET%
)
echo.

echo %C_CYAN%[5/8] Frontend (web, npm install)...%C_RESET%
if not exist "%ROOT%\web\node_modules" (
  pushd "%ROOT%\web"
  call npm install
  set "NPM_RC=!errorlevel!"
  popd
  if not "!NPM_RC!"=="0" ( echo %C_RED%  [x] Falha no npm install.%C_RESET% & goto :fail )
) else (
  echo %C_GREEN%  [ok] node_modules ja existe%C_RESET%
)
echo.

echo Encerrando instancias anteriores nas portas 8000 e 5174 (evita conflito e Internal Server Error)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do taskkill /F /PID %%p >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5174"') do taskkill /F /PID %%p >nul 2>nul
echo.

echo %C_CYAN%[6/8] Subindo o backend na porta 8000...%C_RESET%
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

echo %C_CYAN%[7/8] Subindo o frontend na porta 5174...%C_RESET%
start "Sharpz Web" cmd /c "cd /d "%ROOT%\web" && npm run dev > "%ROOT%\next.log" 2> "%ROOT%\next.err.log""
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

echo %C_CYAN%[8/8] Abrindo o dashboard no Chrome...%C_RESET%
start chrome "%WEB_URL%"
echo.
echo %C_BOLD%%C_GREEN%==========================================================%C_RESET%
echo %C_BOLD%  Sharpz esta rodando 100%%:%C_RESET%
echo %C_GREEN%    Dashboard : %WEB_URL%  (aba "Transcricao")%C_RESET%
echo %C_GREEN%    API       : http://127.0.0.1:8000%C_RESET%
echo.
echo %C_YEL%  Diarizacao (locutores): aceite os termos em%C_RESET%
echo %C_YEL%    https://huggingface.co/pyannote/speaker-diarization-community-1%C_RESET%
echo %C_YEL%  Parar: feche as janelas "Sharpz API" e "Sharpz Web".%C_RESET%
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
echo %C_RED%%C_BOLD%Setup interrompido por erro. Corrija o item acima e rode novamente.%C_RESET%
echo.
pause
exit /b 1

:end
echo %C_CYAN%Pode fechar esta janela; os servicos seguem nas janelas Sharpz API / Sharpz Web.%C_RESET%
pause
exit /b 0
