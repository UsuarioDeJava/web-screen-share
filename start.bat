@echo off
setlocal enabledelayedexpansion

set "DIR=%~dp0"
set "BIN=%DIR%mediamtx.exe"
set "MEDIAMTX_VERSION=v1.21.0"

if "%RTMP_PORT%"=="" set "RTMP_PORT=1935"
if "%RTSP_PORT%"=="" set "RTSP_PORT=8554"
if "%HLS_PORT%"=="" set "HLS_PORT=8888"
if "%STREAM_KEY%"=="" set "STREAM_KEY=screen"

if not exist "%BIN%" (
  echo Baixando o MediaMTX ^(servidor de streaming^) - so acontece uma vez...
  set "URL=https://github.com/bluenviron/mediamtx/releases/download/%MEDIAMTX_VERSION%/mediamtx_%MEDIAMTX_VERSION%_windows_amd64.zip"
  curl -fL "!URL!" -o "%TEMP%\mediamtx.zip"
  if errorlevel 1 (
    echo Falha ao baixar. Baixe manualmente em https://github.com/bluenviron/mediamtx/releases
    echo e coloque mediamtx.exe nesta pasta.
    pause
    exit /b 1
  )
  tar -xf "%TEMP%\mediamtx.zip" -C "%DIR%"
  del "%TEMP%\mediamtx.zip"
)

set "CONFIG=%DIR%mediamtx.yml"
if not exist "%CONFIG%" (
  > "%CONFIG%" echo rtmpAddress: :%RTMP_PORT%
  >> "%CONFIG%" echo rtspAddress: :%RTSP_PORT%
  >> "%CONFIG%" echo hlsAddress: :%HLS_PORT%
  >> "%CONFIG%" echo paths:
  >> "%CONFIG%" echo   all_others:
)

echo.
echo === No PC que transmite: configure o OBS ===
echo Configuracoes ^> Transmissao ^> Servico: Personalizado...
echo   Servidor:             rtmp://localhost:%RTMP_PORT%
echo   Chave de transmissao: %STREAM_KEY%
echo (clique em "Iniciar Transmissao" no OBS depois de rodar este script)
echo.
echo === Para assistir de outro dispositivo na LAN/Tailscale ===
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "IP=%%A"
  set "IP=!IP: =!"
  echo   VLC ^(Midia ^> Abrir Transmissao de Rede^):
  echo       rtsp://!IP!:%RTSP_PORT%/%STREAM_KEY%
  echo   Navegador:
  echo       http://!IP!:%HLS_PORT%/%STREAM_KEY%/index.m3u8
)
echo.
echo (Feche esta janela para parar)
echo.

cd /d "%DIR%"
"%BIN%" "%CONFIG%"
pause
