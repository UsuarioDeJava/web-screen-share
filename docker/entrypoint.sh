#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# Certificado próprio largado na pasta de dados (ex.: gerado com `tailscale cert`):
# o primeiro par NOME.crt + NOME.key cuja chave confere com o certificado é usado.
find_custom_cert() {
  for crt in "$DATA_DIR"/*.crt; do
    [ -f "$crt" ] || continue
    [ "$(basename "$crt")" = "selfsigned.crt" ] && continue
    key="${crt%.crt}.key"
    if [ ! -f "$key" ]; then
      echo "AVISO: achei $(basename "$crt"), mas não $(basename "$key") do lado; ignorando." >&2
      continue
    fi
    cert_pub="$(openssl x509 -noout -pubkey -in "$crt" 2>/dev/null || true)"
    key_pub="$(openssl pkey -pubout -in "$key" 2>/dev/null || true)"
    if [ -z "$cert_pub" ] || [ "$cert_pub" != "$key_pub" ]; then
      echo "AVISO: $(basename "$crt") e $(basename "$key") não formam um par válido; ignorando." >&2
      continue
    fi
    echo "$crt"
    return 0
  done
  return 1
}

# getDisplayMedia só funciona em "contexto seguro". Rodando num container (fora
# do PC que transmite), a página do transmissor não é mais "localhost" pra
# quem abre no navegador, então sem HTTPS a captura de tela nem começa. Por
# isso, diferente do start.sh (que só usa HTTPS se achar o Tailscale), aqui a
# imagem sempre sobe em HTTPS: com TLS_CERT/TLS_KEY se definidos, senão com um
# certificado deixado na pasta de dados, senão com um autoassinado gerado aqui.
if [ -z "$TLS_CERT" ] || [ -z "$TLS_KEY" ] || [ ! -f "$TLS_CERT" ] || [ ! -f "$TLS_KEY" ]; then
  if CUSTOM_CERT="$(find_custom_cert)"; then
    export TLS_CERT="$CUSTOM_CERT"
    export TLS_KEY="${CUSTOM_CERT%.crt}.key"
  fi
fi

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
  echo "Pra evitar o aviso, coloque um certificado de verdade (NOME.crt + NOME.key,"
  echo "ex.: gerado com 'tailscale cert') na pasta de dados e reinicie — veja o README."
else
  echo "Usando o certificado $(basename "$TLS_CERT")"
  echo "  válido para: $(openssl x509 -noout -ext subjectAltName -in "$TLS_CERT" 2>/dev/null | tail -n +2 | sed 's/DNS://g; s/^ *//')"
  echo "  expira em:   $(openssl x509 -noout -enddate -in "$TLS_CERT" | cut -d= -f2)"
  if ! openssl x509 -noout -checkend 0 -in "$TLS_CERT" > /dev/null; then
    echo "AVISO: esse certificado já expirou. Gere de novo (ex.: 'tailscale cert') e reinicie."
  elif ! openssl x509 -noout -checkend 1209600 -in "$TLS_CERT" > /dev/null; then
    echo "AVISO: esse certificado expira em menos de 14 dias. Gere de novo e reinicie."
  fi
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
