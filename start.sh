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

if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  exec 3<&- 2>/dev/null; exec 3>&- 2>/dev/null
  echo "A porta $PORT já está em uso por outro processo (talvez outra instância deste"
  echo "script já rodando em outro terminal?). Veja o que está usando com:"
  echo "    lsof -i:$PORT   (ou: ss -ltnp | grep $PORT)"
  echo "Feche o outro processo, ou use outra porta: PORT=8081 ./start.sh"
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

BIND_FAILS=0
LOG_TMP="$(mktemp)"
trap 'rm -f "$LOG_TMP"' EXIT

while true; do
  ffmpeg -hide_banner -loglevel warning \
    "${VIDEO_ARGS[@]}" \
    "${AUDIO_ARGS[@]}" \
    "${ENCODE_ARGS[@]}" \
    -f mpegts -listen 1 "http://0.0.0.0:$PORT" 2>&1 | tee "$LOG_TMP"

  if grep -q "Address already in use" "$LOG_TMP"; then
    BIND_FAILS=$((BIND_FAILS + 1))
    if [ "$BIND_FAILS" -ge 5 ]; then
      echo ""
      echo "A porta $PORT continua ocupada depois de $BIND_FAILS tentativas — não é algo"
      echo "que vá se resolver sozinho. Provavelmente outra instância deste script (ou outro"
      echo "programa) já está usando essa porta. Veja com: lsof -i:$PORT"
      echo "Feche o outro processo, ou rode com outra porta: PORT=8081 ./start.sh"
      exit 1
    fi
    WAIT=$((BIND_FAILS * 3))
    echo "Porta $PORT ocupada, tentando de novo em ${WAIT}s (tentativa $BIND_FAILS/5)..."
    sleep "$WAIT"
    continue
  fi

  BIND_FAILS=0
  echo "Espectador desconectou. Aguardando a próxima conexão..."
  sleep 1
done
