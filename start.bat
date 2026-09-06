@echo off
setlocal enabledelayedexpansion

if "%PORT%"=="" set "PORT=8080"
if "%FRAMERATE%"=="" set "FRAMERATE=30"
if "%VIDEO_BITRATE%"=="" set "VIDEO_BITRATE=4M"

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo FFmpeg nao encontrado. Baixe em https://www.gyan.dev/ffmpeg/builds/ e adicione a pasta bin ao PATH.
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

:loop
if defined AUDIO_DEVICE (
  ffmpeg -hide_banner -loglevel warning -f gdigrab -framerate %FRAMERATE% -i desktop -f dshow -i audio="%AUDIO_DEVICE%" -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -b:v %VIDEO_BITRATE% -c:a aac -b:a 128k -f mpegts -listen 1 http://0.0.0.0:%PORT%
) else (
  ffmpeg -hide_banner -loglevel warning -f gdigrab -framerate %FRAMERATE% -i desktop -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -b:v %VIDEO_BITRATE% -f mpegts -listen 1 http://0.0.0.0:%PORT%
)
echo Espectador desconectou. Aguardando a proxima conexao...
timeout /t 1 /nobreak >nul
goto loop
