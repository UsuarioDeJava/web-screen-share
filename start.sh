#!/usr/bin/env bash
# Transmite a tela (e o áudio do sistema, se disponível) via HTTP/MPEG-TS,
# pra assistir de qualquer dispositivo da rede abrindo o endereço no VLC
# (Mídia > Abrir Transmissão de Rede). Não precisa de navegador nem servidor
# além do próprio ffmpeg.
set -e

PORT="${PORT:-8080}"
FRAMERATE="${FRAMERATE:-30}"
VIDEO_BITRATE="${VIDEO_BITRATE:-4M}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg não encontrado. Instale com: sudo apt install ffmpeg (ou o gerenciador de pacotes da sua distro)."
  exit 1
fi

X_DISPLAY="${DISPLAY:-:0.0}"

AUDIO_SOURCE="${AUDIO_SOURCE:-}"
if [ -z "$AUDIO_SOURCE" ] && command -v pactl >/dev/null 2>&1; then
  DEFAULT_SINK="$(pactl get-default-sink 2>/dev/null || true)"
  if [ -n "$DEFAULT_SINK" ]; then
    AUDIO_SOURCE="${DEFAULT_SINK}.monitor"
  fi
fi

VIDEO_ARGS=(-f x11grab -framerate "$FRAMERATE")
if [ -n "${VIDEO_SIZE:-}" ]; then
  VIDEO_ARGS+=(-video_size "$VIDEO_SIZE")
fi
VIDEO_ARGS+=(-i "$X_DISPLAY")

ENCODE_ARGS=(-c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -b:v "$VIDEO_BITRATE")

if [ -n "$AUDIO_SOURCE" ]; then
  echo "Capturando áudio do sistema em: $AUDIO_SOURCE"
  AUDIO_ARGS=(-f pulse -i "$AUDIO_SOURCE")
  ENCODE_ARGS+=(-c:a aac -b:a 128k)
else
  echo "Nenhuma fonte de áudio detectada/definida — transmitindo sem som."
  echo "(Rode 'pactl list short sources' pra achar a sua e force com: AUDIO_SOURCE=nome ./start.sh)"
  AUDIO_ARGS=()
fi

echo ""
echo "Transmitindo sua tela em http://0.0.0.0:$PORT"
echo "No VLC de outro dispositivo: Mídia > Abrir Transmissão de Rede > cole um destes endereços:"
for ip in $(hostname -I 2>/dev/null); do
  echo "    http://$ip:$PORT"
done
echo ""
echo "(Ctrl+C para parar)"
echo ""

while true; do
  ffmpeg -hide_banner -loglevel warning \
    "${VIDEO_ARGS[@]}" \
    "${AUDIO_ARGS[@]}" \
    "${ENCODE_ARGS[@]}" \
    -f mpegts -listen 1 "http://0.0.0.0:$PORT" || true
  echo "Espectador desconectou. Aguardando a próxima conexão..."
  sleep 1
done
