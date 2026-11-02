@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Node.js 22.13+ is required. Please install Node.js 24 LTS.
  pause
  exit /b 1
)
set HOST=127.0.0.1
set PORT=3000
set COOKIE_SECURE=1
set TRUST_CLOUDFLARE=1
node -e "const net=require('node:net');const s=net.createServer();s.once('error',()=>{console.error('Port 3000 is already in use. Close the previous website window first.');process.exit(1)});s.listen(3000,'127.0.0.1',()=>s.close())"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Public HTTPS mode. Keep this window open.
echo Next: double-click start-tunnel-windows.bat and use its HTTPS URL.
echo Do not log in through localhost in this mode.
node server.js
if errorlevel 1 pause
