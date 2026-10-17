@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org/ e tente novamente.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

if "%TLS_CERT%"=="" if "%TLS_KEY%"=="" (
  where tailscale >nul 2>nul
  if not errorlevel 1 (
    for /f "delims=" %%H in ('tailscale status --json 2^>nul ^| node scripts\tailscale-dnsname.js 2^>nul') do set "TS_HOSTNAME=%%H"

    if defined TS_HOSTNAME (
      if not exist "!TS_HOSTNAME!.crt" (
        echo Gerando certificado HTTPS do Tailscale para !TS_HOSTNAME!...
        tailscale cert "!TS_HOSTNAME!"
      )
      if exist "!TS_HOSTNAME!.crt" if exist "!TS_HOSTNAME!.key" (
        set "TLS_CERT=%CD%\!TS_HOSTNAME!.crt"
        set "TLS_KEY=%CD%\!TS_HOSTNAME!.key"
      )
    )
  )
)

call npm start
pause
