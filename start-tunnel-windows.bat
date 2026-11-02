@echo off
setlocal
cd /d "%~dp0"
node -e "fetch('http://127.0.0.1:3000/api/questions',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >nul 2>nul
if errorlevel 1 (
  echo Start start-public-windows.bat first, then try again.
  pause
  exit /b 1
)
set "TUNNEL_EXE=cloudflared"
where cloudflared >nul 2>nul
if errorlevel 1 (
  if exist "%~dp0cloudflared.exe" (
    set "TUNNEL_EXE=%~dp0cloudflared.exe"
  ) else (
    echo Cloudflared is not installed.
    echo In a new command prompt, run:
    echo winget install --id Cloudflare.cloudflared --exact
    echo Then reopen this file. See PUBLIC-ACCESS.md for manual download.
    pause
    exit /b 1
  )
)
echo Keep this window open. Wait for the https://...trycloudflare.com URL.
echo Share that HTTPS URL. It may change when the tunnel restarts.
"%TUNNEL_EXE%" tunnel --url http://127.0.0.1:3000 --protocol http2
if errorlevel 1 pause
