"""Tenta usar o TURN embutido como ponte TCP (RFC 6062) até a API do MediaMTX
(127.0.0.1:9997), com credenciais obtidas de /ice-servers, como faria um visitante
qualquer da página. Sai com 0 se a ponte foi RECUSADA (seguro) e 1 se funcionou."""
import base64, hashlib, hmac, json, os, socket, ssl, struct, sys, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://127.0.0.1:3001'
TURN_HOST = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
TURN_PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 3001
PEER = ('127.0.0.1', int(sys.argv[4]) if len(sys.argv) > 4 else 9997)
COOKIE = 0x2112A442

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
servers = json.load(urllib.request.urlopen(BASE + '/ice-servers', context=ctx))
turn = next(s for s in servers if 'username' in s and any('transport=tcp' in u for u in ([s['urls']] if isinstance(s['urls'], str) else s['urls'])))
username, password = turn['username'], turn['credential']


def attr(t, v):
    return struct.pack('!HH', t, len(v)) + v + b'\0' * ((4 - len(v) % 4) % 4)


def xor_addr(host, port):
    ip = struct.unpack('!I', socket.inet_aton(host))[0]
    return struct.pack('!BBHI', 0, 1, port ^ (COOKIE >> 16), ip ^ COOKIE)


def message(mtype, attrs, key=None):
    tid = os.urandom(12)
    body = b''.join(attrs)
    if key is None:
        return struct.pack('!HHI', mtype, len(body), COOKIE) + tid + body
    head = struct.pack('!HHI', mtype, len(body) + 24, COOKIE) + tid
    mac = hmac.new(key, head + body, hashlib.sha1).digest()
    return head + body + attr(0x0008, mac)


def recv_msg(sock):
    head = b''
    while len(head) < 20:
        chunk = sock.recv(20 - len(head))
        if not chunk:
            raise ConnectionError('conexão fechada')
        head += chunk
    mtype, length = struct.unpack('!HH', head[:4])
    body = b''
    while len(body) < length:
        body += sock.recv(length - len(body))
    attrs, i = {}, 0
    while i < len(body):
        t, l = struct.unpack('!HH', body[i:i + 4])
        attrs[t] = body[i + 4:i + 4 + l]
        i += 4 + l + ((4 - l % 4) % 4)
    return mtype, attrs


def error_of(attrs):
    v = attrs.get(0x0009)
    return f'{v[2] * 100 + v[3]} {v[4:].decode(errors="replace")}' if v else '?'


ctrl = socket.create_connection((TURN_HOST, TURN_PORT), timeout=5)
req_tcp = attr(0x0019, bytes([6, 0, 0, 0]))
ctrl.sendall(message(0x0003, [req_tcp]))
mtype, attrs = recv_msg(ctrl)
realm, nonce = attrs[0x0014], attrs[0x0015]
key = hashlib.md5(f'{username}:{realm.decode()}:{password}'.encode()).digest()
auth = [attr(0x0006, username.encode()), attr(0x0014, realm), attr(0x0015, nonce)]

ctrl.sendall(message(0x0003, [req_tcp] + auth, key))
mtype, attrs = recv_msg(ctrl)
if mtype != 0x0103:
    print(f'Alocação TCP recusada pelo TURN: {error_of(attrs)}')
    sys.exit(0)
print('Alocação TCP aceita pelo TURN')

ctrl.sendall(message(0x000A, [attr(0x0012, xor_addr(*PEER))] + auth, key))
mtype, attrs = recv_msg(ctrl)
if mtype != 0x010A:
    print(f'CONNECT pra {PEER} recusado: {error_of(attrs)}')
    sys.exit(0)
conn_id = attrs[0x002A]

data = socket.create_connection((TURN_HOST, TURN_PORT), timeout=5)
data.sendall(message(0x000B, [attr(0x002A, conn_id)] + auth, key))
mtype, attrs = recv_msg(data)
if mtype != 0x010B:
    print(f'ConnectionBind recusado: {error_of(attrs)}')
    sys.exit(0)

data.sendall(b'GET /v3/paths/list HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n')
resp = b''
try:
    while True:
        chunk = data.recv(4096)
        if not chunk:
            break
        resp += chunk
except socket.timeout:
    pass
status = resp.split(b'\r\n', 1)[0].decode(errors='replace')
print(f'Pela ponte TCP do TURN, a API do MediaMTX respondeu: {status}')
sys.exit(1 if b' 200 ' in resp[:20] else 0)
