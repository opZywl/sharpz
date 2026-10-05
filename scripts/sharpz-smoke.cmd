@echo off
chcp 65001 >nul
setlocal

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "BPY=%ROOT%\venv\Scripts\python.exe"

if not exist "%BPY%" (
    echo [ERRO] Python do backend nao encontrado em:
    echo        %BPY%
    echo        Rode o sharpz.cmd e escolha Instalar primeiro.
    pause
    exit /b 1
)

echo Verificando se o backend esta online em http://127.0.0.1:8000 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:8000/api/health'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
    echo [ERRO] Backend offline. Rode o sharpz.cmd e escolha Instalar primeiro.
    pause
    exit /b 1
)

echo Backend online. Rodando smoke test...
echo.
"%BPY%" "%ROOT%\tests\smoke.py"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo Smoke test concluido com sucesso.
) else (
    echo Smoke test falhou ^(codigo %RC%^).
)

pause
exit /b %RC%
