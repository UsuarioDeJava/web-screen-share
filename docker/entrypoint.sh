#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# getDisplayMedia só funciona em "contexto seguro". Rodando num container (fora
# do PC que transmite), a página do transmissor não é mais "localhost" pra
# quem abre no navegador, então sem HTTPS a captura de tela nem começa. Por
# isso, diferente do start.sh (que só usa HTTPS se achar o Tailscale), aqui a
# imagem sempre sobe em HTTPS — com um certificado próprio (autoassinado,
# gerado uma vez e guardado em /data) se nenhum TLS_CERT/TLS_KEY for montado.
if [ -z "$TLS_CERT" ] || [ -z "$TLS_KEY" ] || [ ! -f "$TLS_CERT" ] || [ ! -f "$TLS_KEY" ]; then
  if [ ! -f "$DATA_DIR/selfsigned.crt" ] || [ ! -f "$DATA_DIR/selfsigned.key" ]; then
    echo "Gerando certificado HTTPS autoassinado (só acontece uma vez, fica em /data)..."
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$DATA_DIR/selfsigned.key" \
      -out "$DATA_DIR/selfsigned.crt" \
      -days 3650 \
      -subj "/CN=web-screen-share" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  fi
  export TLS_CERT="$DATA_DIR/selfsigned.crt"
  export TLS_KEY="$DATA_DIR/selfsigned.key"
  echo "Usando certificado autoassinado — o navegador vai mostrar um aviso de"
  echo "segurança na primeira visita (normal, clique em avançar/continuar)."
  echo "Pra evitar o aviso, monte um certificado de verdade via TLS_CERT/TLS_KEY"
  echo "(ex.: gerado com 'tailscale cert' no host) — veja o README."
fi

# TURN embutido (coturn): quando a conexão direta entre dois navegadores falha, o
# vídeo passa por aqui. Ele só escuta em 127.0.0.1 (o Node repassa as conexões TURN
# que chegam na porta do site) e só retransmite entre alocações deste próprio
# servidor, sem servir de ponte pra rede local nem pra internet. O aviso do coturn
# sobre allow-loopback-peers não se aplica: o único destino liberado é 127.0.0.1, e
# ali não há serviço UDP além das próprias alocações (o Node só usa TCP).
if [ ! -s "$DATA_DIR/turn-secret" ]; then
  (umask 077 && openssl rand -hex 32 > "$DATA_DIR/turn-secret")
fi
export LOCAL_TURN_SECRET="$(cat "$DATA_DIR/turn-secret")"
export LOCAL_TURN_PORT="${LOCAL_TURN_PORT:-3478}"

TURN_CONF="$(mktemp)"
cat > "$TURN_CONF" <<EOF
listening-ip=127.0.0.1
listening-port=$LOCAL_TURN_PORT
relay-ip=127.0.0.1
min-port=49152
max-port=65535
no-udp
no-tls
no-dtls
no-cli
fingerprint
use-auth-secret
static-auth-secret=$LOCAL_TURN_SECRET
realm=web-screen-share
allow-loopback-peers
denied-peer-ip=0.0.0.0-255.255.255.255
denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
allowed-peer-ip=127.0.0.1
simple-log
no-stdout-log
log-file=/tmp/turnserver.log
pidfile=/tmp/turnserver.pid
EOF
turnserver -c "$TURN_CONF" >> /tmp/turnserver.log 2>&1 &

export IN_CONTAINER=1
exec node server/index.js
