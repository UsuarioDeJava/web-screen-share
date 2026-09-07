@echo off
setlocal enabledelayedexpansion

if "%PORT%"=="" set "PORT=8080"
if "%FRAMERATE%"=="" set "FRAMERATE=30"
if "%VIDEO_BITRATE%"=="" set "VIDEO_BITRATE=2M"

set /a GOP=%FRAMERATE% * 2

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo FFmpeg nao encontrado. Baixe em https://www.gyan.dev/ffmpeg/builds/ e adicione a pasta bin ao PATH.
  pause
  exit /b 1
)

netstat -ano | findstr /c:":%PORT% " | findstr /c:"LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo A porta %PORT% ja esta em uso por outro processo ^(talvez outra instancia
  echo deste script ja rodando em outra janela?^). Veja com: netstat -ano ^| findstr :%PORT%
  echo Feche o outro processo, ou use outra porta: set PORT=8081 ^&^& start.bat
  pause
  exit /b 1
)

if defined AUDIO_DEVICE (
  echo Capturando audio de: %AUDIO_DEVICE%
) else (
  echo Nenhum AUDIO_DEVICE definido - transmitindo sem som.
  echo Rode "ffmpeg -f dshow -list_devices true -i dummy" pra listar dispositivos,
  echo ache algo como "Mixagem Estereo"/"Stereo Mix" e use:
  echo   set AUDIO_DEVICE=NomeExato ^&^& start.bat
)

echo.
echo Transmitindo sua tela em http://0.0.0.0:%PORT%
echo No VLC de outro dispositivo: Midia ^> Abrir Transmissao de Rede ^> cole um destes enderecos:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%A"
  echo     http://!IP: =!:%PORT%
)
echo.
echo (Feche esta janela para parar)
echo.

set FAILS=0
set "LOGFILE=%TEMP%\web-screen-share-ffmpeg.log"

:loop
if defined AUDIO_DEVICE (
  ffmpeg -hide_banner -loglevel warning -f gdigrab -framerate %FRAMERATE% -i desktop -f dshow -i audio="%AUDIO_DEVICE%" -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -b:v %VIDEO_BITRATE% -maxrate %VIDEO_BITRATE% -bufsize %VIDEO_BITRATE% -g %GOP% -keyint_min %FRAMERATE% -c:a aac -b:a 128k -f mpegts -listen 1 http://0.0.0.0:%PORT% > "%LOGFILE%" 2>&1
) else (
  ffmpeg -hide_banner -loglevel warning -f gdigrab -framerate %FRAMERATE% -i desktop -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -b:v %VIDEO_BITRATE% -maxrate %VIDEO_BITRATE% -bufsize %VIDEO_BITRATE% -g %GOP% -keyint_min %FRAMERATE% -f mpegts -listen 1 http://0.0.0.0:%PORT% > "%LOGFILE%" 2>&1
)
type "%LOGFILE%"

findstr /c:"Address already in use" "%LOGFILE%" >nul
if %errorlevel%==0 (
  set /a FAILS+=1
  if !FAILS! geq 5 (
    echo.
    echo A porta %PORT% continua ocupada depois de !FAILS! tentativas - nao e algo que
    echo va se resolver sozinho. Provavelmente outra instancia deste script ja esta
    echo rodando. Veja com: netstat -ano ^| findstr :%PORT%
    echo Feche o outro processo, ou rode com outra porta: set PORT=8081 ^&^& start.bat
    pause
    exit /b 1
  )
  set /a WAIT=!FAILS!*3
  echo Porta %PORT% ocupada, tentando de novo em !WAIT!s ^(tentativa !FAILS!/5^)...
  timeout /t !WAIT! /nobreak >nul
  goto loop
)

set FAILS=0
echo Espectador desconectou. Aguardando a proxima conexao...
timeout /t 1 /nobreak >nul
goto loop
