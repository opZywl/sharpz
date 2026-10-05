@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Sharpz
set "SCRIPTS=%~dp0scripts"
call "%SCRIPTS%\languages\load.cmd"
set "ACTION=%~1"
if not "%ACTION%"=="" goto :run

echo.
echo   Sharpz
echo   ------------------------------------------
echo   !T_MENU_1!
echo   !T_MENU_2!
echo   !T_MENU_3!
echo   !T_MENU_4!
echo   ------------------------------------------
echo.
set /p "ACTION=!T_MENU_PROMPT! "

:run
if /i "%ACTION%"=="1" set "ACTION=install"
if /i "%ACTION%"=="2" set "ACTION=open"
if /i "%ACTION%"=="3" set "ACTION=prod"
if /i "%ACTION%"=="4" set "ACTION=test"
if /i "%ACTION%"=="instalar" set "ACTION=install"
if /i "%ACTION%"=="abrir" set "ACTION=open"
if /i "%ACTION%"=="producao" set "ACTION=prod"
if /i "%ACTION%"=="testar" set "ACTION=test"

if /i "%ACTION%"=="install" call "%SCRIPTS%\sharpz-setup.cmd" & exit /b
if /i "%ACTION%"=="open" call "%SCRIPTS%\sharpz-dev.cmd" & exit /b
if /i "%ACTION%"=="prod" call "%SCRIPTS%\sharpz-prod.cmd" & exit /b
if /i "%ACTION%"=="test" call "%SCRIPTS%\sharpz-smoke.cmd" & exit /b

echo.
echo   !T_MENU_INVALID! !ACTION!
echo   !T_MENU_USAGE!
echo.
pause
exit /b 1
