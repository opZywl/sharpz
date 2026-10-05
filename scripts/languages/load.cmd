@echo off
if not defined SHARPZ_LANG for /f "usebackq delims=" %%L in (`powershell -NoProfile -Command "[System.Globalization.CultureInfo]::CurrentUICulture.Name" 2^>nul`) do set "SHARPZ_LANG=%%L"
if not defined SHARPZ_LANG set "SHARPZ_LANG=en"
if /i "%SHARPZ_LANG:~0,2%"=="pt" (set "SHARPZ_LANG=pt-BR") else (set "SHARPZ_LANG=en")
call "%~dp0%SHARPZ_LANG%.cmd"
exit /b 0
