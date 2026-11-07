@echo off
setlocal
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
cd /d "%ROOT%\client"
echo PA4 Web live logs
npm run dev
if errorlevel 1 echo Web exited with an error.
