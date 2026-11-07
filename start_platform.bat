@echo off
setlocal

cd /d "%~dp0"
set "ROOT_DIR=%CD%"
set "API_HEALTH_URL=http://127.0.0.1:5050/api/health"
set "WEB_URL=http://127.0.0.1:5173"
set "API_WAIT_TIMEOUT=90"
set "WEB_WAIT_TIMEOUT=90"
set "RUNTIME_DIR=%ROOT_DIR%\.runtime"
set "API_RUNNER=%RUNTIME_DIR%\run_api.cmd"
set "WEB_RUNNER=%RUNTIME_DIR%\run_web.cmd"
set "PREFLIGHT_ONLY=0"

if /i "%~1"=="--preflight-only" set "PREFLIGHT_ONLY=1"

echo Preparing the PA4 API and web runtime...

if not exist "%ROOT_DIR%\server\src\server.js" goto missing_server
if not exist "%ROOT_DIR%\client\package.json" goto missing_client
if not exist "%ROOT_DIR%\server\.env" goto missing_env
if not exist "%ROOT_DIR%\server\node_modules" goto missing_server_node_modules
if not exist "%ROOT_DIR%\client\node_modules" goto missing_client_node_modules

where node >nul 2>&1
if errorlevel 1 goto missing_node

where npm >nul 2>&1
if errorlevel 1 goto missing_npm

if "%PREFLIGHT_ONLY%"=="1" goto preflight_only_done

powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%API_HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto api_already_running

if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
(
  echo @echo off
  echo setlocal
  echo set "ROOT=%%~dp0.."
  echo for %%%%I in ^("%%ROOT%%"^) do set "ROOT=%%%%~fI"
  echo cd /d "%%ROOT%%\server"
  echo echo PA4 API live logs
  echo npm run dev
  echo if errorlevel 1 echo API exited with an error.
) > "%API_RUNNER%"
start "PA4 API" cmd /k call "%API_RUNNER%"
goto wait_for_api_start

:api_already_running
echo PA4 API is already responding on %API_HEALTH_URL%. Reusing it.
goto start_web

:wait_for_api_start
echo Waiting for PA4 API to respond on %API_HEALTH_URL% ...
set /a API_WAIT_SECONDS=0

:wait_for_api
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%API_HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto start_web

set /a API_WAIT_SECONDS+=1
if %API_WAIT_SECONDS% GEQ %API_WAIT_TIMEOUT% goto api_wait_timeout
timeout /t 1 /nobreak >nul
goto wait_for_api

:api_wait_timeout
echo.
echo API did not become ready within %API_WAIT_TIMEOUT% seconds.
echo Review the "PA4 API" window for the first Node, MongoDB, or .env error.
echo The web app was not started because projects and memberships need the API.
goto failed

:start_web
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%WEB_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto web_ready

if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
(
  echo @echo off
  echo setlocal
  echo set "ROOT=%%~dp0.."
  echo for %%%%I in ^("%%ROOT%%"^) do set "ROOT=%%%%~fI"
  echo cd /d "%%ROOT%%\client"
  echo echo PA4 Web live logs
  echo npm run dev
  echo if errorlevel 1 echo Web exited with an error.
) > "%WEB_RUNNER%"
start "PA4 Web" cmd /k call "%WEB_RUNNER%"
echo Waiting for PA4 Web to respond on %WEB_URL% ...
set /a WEB_WAIT_SECONDS=0
goto wait_for_web

:web_ready
echo PA4 Web is already responding on %WEB_URL%. Reusing it.
goto done

:wait_for_web
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%WEB_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto web_started

set /a WEB_WAIT_SECONDS+=1
if %WEB_WAIT_SECONDS% GEQ %WEB_WAIT_TIMEOUT% goto web_wait_timeout
timeout /t 1 /nobreak >nul
goto wait_for_web

:web_started
echo PA4 Web is ready on %WEB_URL%.
goto done

:web_wait_timeout
echo.
echo Web did not become ready within %WEB_WAIT_TIMEOUT% seconds.
echo Review the "PA4 Web" window for the first npm or Vite error.
goto failed

:missing_server
echo.
echo Missing server\src\server.js. Run this script from the PA4 project root.
goto failed

:missing_client
echo.
echo Missing client\package.json. Run this script from the PA4 project root.
goto failed

:missing_env
echo.
echo Missing server\.env. Add MONGO_URI before starting the API.
goto failed

:missing_server_node_modules
echo.
echo Missing server\node_modules. Run npm install from the server folder.
goto failed

:missing_client_node_modules
echo.
echo Missing client\node_modules. Run npm install from the client folder.
goto failed

:missing_node
echo.
echo Node.js was not found on PATH.
goto failed

:missing_npm
echo.
echo npm was not found on PATH.
goto failed

:preflight_only_done
echo.
echo PA4 runtime preflight completed successfully. No server windows were opened.
goto end

:done
echo.
echo PA4 platform is ready.
echo API health: %API_HEALTH_URL%
echo Web app:    %WEB_URL%
echo Live logs appear in the "PA4 API" and "PA4 Web" windows when those servers are started by this launcher.
echo.
echo If a dev server is stuck, run clear_platform_ports.bat and then start_platform.bat again.
echo.

:succeeded
if /i "%~1"=="--no-wait" goto end
timeout /t 8 /nobreak >nul
goto end

:failed
echo.
if /i "%~1"=="--no-wait" goto error_end
timeout /t 8 /nobreak >nul

:error_end
endlocal
exit /b 1

:end
endlocal
exit /b 0
