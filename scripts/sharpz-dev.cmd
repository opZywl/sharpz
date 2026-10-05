@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Sharpz - Abrir

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
echo %C_BOLD%%C_CYAN%   Sharpz - Abrir (dev)%C_RESET%
echo %C_BOLD%%C_CYAN%====================================================%C_RESET%
echo.

echo %C_CYAN%[1/7] Verificando pre-requisitos...%C_RESET%

where node >nul 2>nul
if errorlevel 1 (
  echo %C_RED%  [x] Node.js nao encontrado no PATH.%C_RESET%
  echo %C_YEL%      Instale o Node 20+ em https://nodejs.org e abra um novo terminal.%C_RESET%
  goto :fail
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo %C_GREEN%  [ok] Node %NODE_VER%%C_RESET%

call :ensure_tool uv
if errorlevel 1 (
  echo %C_RED%  [x] uv nao encontrado no PATH.%C_RESET%
  echo %C_YEL%      Instale com:  winget install --id=astral-sh.uv -e%C_RESET%
  echo %C_YEL%      Depois abra um novo terminal e rode este script de novo.%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] uv disponivel%C_RESET%

call :ensure_tool ffmpeg
if errorlevel 1 (
  echo %C_RED%  [x] ffmpeg nao encontrado no PATH.%C_RESET%
  echo %C_YEL%      Instale com:  winget install --id=Gyan.FFmpeg -e%C_RESET%
  echo %C_YEL%      Depois abra um novo terminal e rode este script de novo.%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] ffmpeg disponivel%C_RESET%
echo.

echo %C_CYAN%[2/7] Preparando o motor de transcricao (whisper-venv)...%C_RESET%
if not exist "%WPY%" (
  echo %C_YEL%  whisper-venv ausente. Criando com Python 3.12 via uv...%C_RESET%
  uv venv "%WVENV%" --python 3.12
  if errorlevel 1 (
    echo %C_RED%  [x] Falha ao criar whisper-venv.%C_RESET%
    goto :fail
  )
) else (
  echo %C_GREEN%  [ok] whisper-venv ja existe%C_RESET%
)

echo %C_CYAN%  Instalando faster-whisper (idempotente)...%C_RESET%
uv pip install -p "%WPY%" faster-whisper
if errorlevel 1 (
  echo %C_RED%  [x] Falha ao instalar faster-whisper.%C_RESET%
  goto :fail
)

echo %C_CYAN%  Instalando torch/torchaudio (indice CPU)...%C_RESET%
uv pip install -p "%WPY%" torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 (
  echo %C_RED%  [x] Falha ao instalar torch/torchaudio.%C_RESET%
  goto :fail
)

echo %C_CYAN%  Instalando whisperX + pyannote (PyPI, opcional)...%C_RESET%
uv pip install -p "%WPY%" whisperx imageio-ffmpeg
if errorlevel 1 (
  echo %C_YEL%  [!] Falha ao instalar whisperX. Alinhamento/diarizacao ficarao indisponiveis;%C_RESET%
  echo %C_YEL%      a transcricao basica ^(faster-whisper^) continua funcionando.%C_RESET%
) else (
  echo %C_GREEN%  [ok] whisperX instalado%C_RESET%
)
echo.

echo %C_CYAN%[3/7] Preparando o backend FastAPI (venv)...%C_RESET%
if not exist "%BPY%" (
  echo %C_YEL%  venv do backend ausente. Criando com o Python do sistema...%C_RESET%
  python -m venv "%BVENV%"
  if errorlevel 1 (
    echo %C_RED%  [x] Falha ao criar o venv do backend. Verifique se o Python esta no PATH.%C_RESET%
    goto :fail
  )
  echo %C_CYAN%  Instalando dependencias do backend ^(requirements.txt^)...%C_RESET%
  "%BPY%" -m pip install --upgrade pip
  "%BPY%" -m pip install -r "%ROOT%\requirements.txt" -c "%ROOT%\constraints.txt"
  if errorlevel 1 (
    echo %C_RED%  [x] Falha ao instalar requirements.txt do backend.%C_RESET%
    goto :fail
  )
) else (
  echo %C_GREEN%  [ok] venv do backend ja existe%C_RESET%
)

echo %C_CYAN%  Iniciando server.py na porta 8000...%C_RESET%
start "Sharpz API" cmd /c ""%BPY%" "%ROOT%\server.py" > "%ROOT%\fastapi.log" 2> "%ROOT%\fastapi.err.log""

echo %C_CYAN%  Aguardando healthcheck em %API_URL% ...%C_RESET%
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
  echo %C_RED%  [x] Backend nao respondeu 200 em %API_URL% dentro do tempo limite.%C_RESET%
  echo %C_YEL%      Veja %ROOT%\fastapi.err.log para detalhes.%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] Backend respondendo em http://127.0.0.1:8000%C_RESET%
echo.

echo %C_CYAN%[4/7] Preparando o frontend Next.js (web)...%C_RESET%
if not exist "%ROOT%\web\node_modules" (
  echo %C_YEL%  node_modules ausente. Rodando npm install...%C_RESET%
  pushd "%ROOT%\web"
  call npm install
  set "NPM_RC=!errorlevel!"
  popd
  if not "!NPM_RC!"=="0" (
    echo %C_RED%  [x] Falha no npm install.%C_RESET%
    goto :fail
  )
) else (
  echo %C_GREEN%  [ok] node_modules ja existe%C_RESET%
)

echo %C_CYAN%  Iniciando npm run dev na porta 5174...%C_RESET%
start "Sharpz Web" cmd /c "cd /d "%ROOT%\web" && npm run dev > "%ROOT%\next.log" 2> "%ROOT%\next.err.log""

echo %C_CYAN%  Aguardando %WEB_URL% responder...%C_RESET%
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
  echo %C_RED%  [x] Frontend nao respondeu 200 em %WEB_URL% dentro do tempo limite.%C_RESET%
  echo %C_YEL%      Veja %ROOT%\next.err.log para detalhes.%C_RESET%
  goto :fail
)
echo %C_GREEN%  [ok] Frontend respondendo em %WEB_URL%%C_RESET%
echo.

echo %C_CYAN%[5/7] Status dos servicos%C_RESET%
echo %C_GREEN%  [200] Backend  : http://127.0.0.1:8000/api/health%C_RESET%
echo %C_GREEN%  [200] Frontend : %WEB_URL%%C_RESET%
echo.

echo %C_CYAN%[6/7] Abrindo o dashboard no Chrome...%C_RESET%
start chrome "%WEB_URL%"
if errorlevel 1 (
  echo %C_YEL%  [!] Nao consegui abrir o Chrome automaticamente.%C_RESET%
  echo %C_YEL%      Abra manualmente: %WEB_URL%%C_RESET%
) else (
  echo %C_GREEN%  [ok] Chrome aberto em %WEB_URL%%C_RESET%
)
echo.

echo %C_CYAN%[7/7] Tudo pronto!%C_RESET%
echo.
echo %C_BOLD%%C_GREEN%====================================================%C_RESET%
echo %C_BOLD%  Sharpz esta rodando:%C_RESET%
echo %C_GREEN%    Frontend (dashboard) : %WEB_URL%%C_RESET%
echo %C_GREEN%    Backend  (API)       : http://127.0.0.1:8000%C_RESET%
echo %C_GREEN%    Aba de transcricao   : %WEB_URL% (use a aba "Transcricao")%C_RESET%
echo.
echo %C_YEL%  Como parar:%C_RESET%
echo %C_YEL%    Feche as janelas "Sharpz API" e "Sharpz Web",%C_RESET%
echo %C_YEL%    ou rode em outro terminal:%C_RESET%
echo %C_YEL%      taskkill /FI "WINDOWTITLE eq Sharpz API" /T /F%C_RESET%
echo %C_YEL%      taskkill /FI "WINDOWTITLE eq Sharpz Web" /T /F%C_RESET%
echo.
echo %C_YEL%  Observacao: na primeira transcricao o modelo large-v3 sera%C_RESET%
echo %C_YEL%  baixado automaticamente (pode demorar alguns minutos).%C_RESET%
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
echo %C_RED%%C_BOLD%Encerrado por erro. Corrija o item acima e rode novamente.%C_RESET%
echo.
pause
exit /b 1

:end
pause
exit /b 0
