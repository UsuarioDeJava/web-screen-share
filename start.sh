#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale em https://nodejs.org/ e tente novamente."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependências..."
  npm install
fi

# HTTPS via Tailscale, se disponível: gera (ou reaproveita) um certificado para
# o nome MagicDNS desta máquina e passa pro servidor via TLS_CERT/TLS_KEY.
if [ -z "$TLS_CERT" ] && [ -z "$TLS_KEY" ] && command -v tailscale >/dev/null 2>&1; then
  TS_HOSTNAME="$(tailscale status --json 2>/dev/null | node scripts/tailscale-dnsname.js 2>/dev/null)"

  if [ -n "$TS_HOSTNAME" ]; then
    if [ ! -f "$TS_HOSTNAME.crt" ] || [ ! -f "$TS_HOSTNAME.key" ]; then
      echo "Gerando certificado HTTPS do Tailscale para $TS_HOSTNAME..."
      tailscale cert "$TS_HOSTNAME" || echo "Não foi possível gerar o certificado automaticamente (veja o README). Seguindo sem HTTPS."
    fi
    if [ -f "$TS_HOSTNAME.crt" ] && [ -f "$TS_HOSTNAME.key" ]; then
      export TLS_CERT="$(pwd)/$TS_HOSTNAME.crt"
      export TLS_KEY="$(pwd)/$TS_HOSTNAME.key"
    fi
  fi
fi

npm start
