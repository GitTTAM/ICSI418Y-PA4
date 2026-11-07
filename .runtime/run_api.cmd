@echo off
setlocal
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
cd /d "%ROOT%\server"
echo PA4 API live logs
npm run dev
if errorlevel 1 echo API exited with an error.
