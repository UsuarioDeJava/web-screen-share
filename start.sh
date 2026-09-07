#!/usr/bin/env bash
# Sobe um servidor MediaMTX: o OBS publica a tela (via "Serviço Personalizado" >
# RTMP) e qualquer dispositivo da rede assiste pelo VLC (RTSP) ou por um navegador
# (HLS). Baixa o MediaMTX sozinho na primeira vez, não precisa instalar nada.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$DIR/mediamtx"
MEDIAMTX_VERSION="v1.21.0"

RTMP_PORT="${RTMP_PORT:-1935}"
RTSP_PORT="${RTSP_PORT:-8554}"
HLS_PORT="${HLS_PORT:-8888}"
STREAM_KEY="${STREAM_KEY:-screen}"

if [ ! -x "$BIN" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) MTX_ARCH="amd64" ;;
    aarch64|arm64) MTX_ARCH="arm64" ;;
    armv7l) MTX_ARCH="armv7" ;;
    armv6l|armv6) MTX_ARCH="armv6" ;;
    *)
      echo "Arquitetura '$ARCH' não tem download automático."
      echo "Baixe manualmente em https://github.com/bluenviron/mediamtx/releases e"
      echo "coloque o binário 'mediamtx' nesta pasta."
      exit 1
      ;;
  esac

  URL="https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${MTX_ARCH}.tar.gz"
  echo "Baixando o MediaMTX (servidor de streaming) — só acontece uma vez..."
  TMP="$(mktemp -d)"
  if ! curl -fL "$URL" -o "$TMP/mediamtx.tar.gz"; then
    echo "Falha ao baixar de $URL"
    rm -rf "$TMP"
    exit 1
  fi
  tar -xzf "$TMP/mediamtx.tar.gz" -C "$TMP"
  cp "$TMP/mediamtx" "$BIN"
  chmod +x "$BIN"
  rm -rf "$TMP"
fi

CONFIG="$DIR/mediamtx.yml"
if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" <<EOF
rtmpAddress: :$RTMP_PORT
rtspAddress: :$RTSP_PORT
hlsAddress: :$HLS_PORT
paths:
  all_others:
EOF
fi

echo ""
echo "=== No PC que transmite: configure o OBS ==="
echo "Configurações > Transmissão > Serviço: Personalizado..."
echo "  Servidor:            rtmp://localhost:$RTMP_PORT"
echo "  Chave de transmissão: $STREAM_KEY"
echo "(clique em 'Iniciar Transmissão' no OBS depois de rodar este script)"
echo ""
echo "=== Para assistir de outro dispositivo na LAN/Tailscale ==="
for ip in $(hostname -I 2>/dev/null); do
  echo "  VLC (Mídia > Abrir Transmissão de Rede):"
  echo "      rtsp://$ip:$RTSP_PORT/$STREAM_KEY"
  echo "  Navegador:"
  echo "      http://$ip:$HLS_PORT/$STREAM_KEY/index.m3u8"
done
echo ""
echo "(Ctrl+C para parar)"
echo ""

cd "$DIR"
exec "$BIN" "$CONFIG"
