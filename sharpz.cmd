@echo off
setlocal
chcp 65001 >nul
title Sharpz
set "SCRIPTS=%~dp0scripts"
set "ACAO=%~1"
if not "%ACAO%"=="" goto :executar

echo.
echo   Sharpz
echo   ------------------------------------------
echo   1  Instalar tudo e abrir  (primeira vez)
echo   2  Abrir o painel         (uso do dia a dia)
echo   3  Modo producao          (build otimizado)
echo   4  Testar                 (smoke test)
echo   ------------------------------------------
echo.
set /p "ACAO=Escolha uma opcao [1-4]: "

:executar
if /i "%ACAO%"=="1" set "ACAO=instalar"
if /i "%ACAO%"=="2" set "ACAO=abrir"
if /i "%ACAO%"=="3" set "ACAO=producao"
if /i "%ACAO%"=="4" set "ACAO=testar"
if /i "%ACAO%"=="install" set "ACAO=instalar"
if /i "%ACAO%"=="open" set "ACAO=abrir"
if /i "%ACAO%"=="prod" set "ACAO=producao"
if /i "%ACAO%"=="test" set "ACAO=testar"

if /i "%ACAO%"=="instalar" call "%SCRIPTS%\sharpz-setup.cmd" & exit /b
if /i "%ACAO%"=="abrir" call "%SCRIPTS%\sharpz-dev.cmd" & exit /b
if /i "%ACAO%"=="producao" call "%SCRIPTS%\sharpz-prod.cmd" & exit /b
if /i "%ACAO%"=="testar" call "%SCRIPTS%\sharpz-smoke.cmd" & exit /b

echo.
echo   Opcao invalida: %ACAO%
echo   Use 1-4 ou: sharpz.cmd instalar ^| abrir ^| producao ^| testar
echo.
pause
exit /b 1
