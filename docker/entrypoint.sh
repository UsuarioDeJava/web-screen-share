#!/bin/sh
set -e

CERT_DIR="/data"
mkdir -p "$CERT_DIR"

# getDisplayMedia só funciona em "contexto seguro". Rodando num container (fora
# do PC que transmite), a página do transmissor não é mais "localhost" pra
# quem abre no navegador, então sem HTTPS a captura de tela nem começa. Por
# isso, diferente do start.sh (que só usa HTTPS se achar o Tailscale), aqui a
# imagem sempre sobe em HTTPS — com um certificado próprio (autoassinado,
# gerado uma vez e guardado em /data) se nenhum TLS_CERT/TLS_KEY for montado.
if [ -z "$TLS_CERT" ] || [ -z "$TLS_KEY" ] || [ ! -f "$TLS_CERT" ] || [ ! -f "$TLS_KEY" ]; then
  if [ ! -f "$CERT_DIR/selfsigned.crt" ] || [ ! -f "$CERT_DIR/selfsigned.key" ]; then
    echo "Gerando certificado HTTPS autoassinado (só acontece uma vez, fica em /data)..."
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$CERT_DIR/selfsigned.key" \
      -out "$CERT_DIR/selfsigned.crt" \
      -days 3650 \
      -subj "/CN=web-screen-share" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  fi
  export TLS_CERT="$CERT_DIR/selfsigned.crt"
  export TLS_KEY="$CERT_DIR/selfsigned.key"
  echo "Usando certificado autoassinado — o navegador vai mostrar um aviso de"
  echo "segurança na primeira visita (normal, clique em avançar/continuar)."
  echo "Pra evitar o aviso, monte um certificado de verdade via TLS_CERT/TLS_KEY"
  echo "(ex.: gerado com 'tailscale cert' no host) — veja o README."
fi

exec node server/index.js
