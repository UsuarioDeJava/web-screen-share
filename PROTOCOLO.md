# Protocolo câmera ↔ app do PC

O que o app de desktop precisa ter pro WSS Câmera funcionar. É o caminho do OBS
(`desktop/obs-local.js`) com outra porta, aberta na rede local, e pareamento.

## Porta

- **HTTP em `0.0.0.0:38219`** (TCP), aberto só enquanto o app está na sala com publicação
  disponível. O celular digita só o IP; a porta é sempre essa.
- **Mídia por UDP** (ICE só com candidatos host, sem STUN/TURN). Sugestão: no
  `PeerConnection` de entrada, `portRangeBegin: 38220, portRangeEnd: 38230` e sem
  `bindAddress` (o do OBS usa `127.0.0.1`). Assim dá pra liberar no firewall do Windows
  só TCP 38219 + UDP 38220–38230 (rede privada).
- Recusar qualquer requisição com header `Origin` (igual ao OBS local). Sem a checagem de
  `Host` (vem com o IP da rede).
- Erros: `text/plain`, curto, em português (o celular mostra o texto como veio, até 200 caracteres).

## Endpoints

### `GET /camera`
Sem autenticação. `200 {"app":"wss-camera","name":"<nome do PC>","version":1}`.
O celular usa pra achar o PC (testa cada IP do QR).

### `POST /camera/pair`
Corpo JSON: `{"device":"<modelo do celular>","code":"<código do QR>"}` (`code` opcional).

- **Com `code`** válido: `200 {"token":"<64 hex>","name":"<nome do PC>"}` na hora.
  Código errado/expirado: `403`.
- **Sem `code`** (IP digitado): o app do PC pergunta *Conectar a câmera "<device>"?*
  **[Conectar] [Recusar]** e segura a requisição até 60 s.
  Aceitou: `200` como acima. Recusou: `403`. Ninguém respondeu: `408`.
  Uma pergunta por vez (outra no meio: `429`).
- Token: aleatório, 32 bytes em hex, sem validade. Guardar só o hash, por aparelho
  (`config.cameraDevices = [{id, name, tokenHash, addedAt}]`), com **Remover** nas
  Configurações. Removido → o celular recebe `401` e volta pro pareamento.

### `POST /camera/whip`
`Authorization: Bearer <token>`, `Content-Type: application/sdp`, corpo = oferta completa
(sem trickle; os candidatos já vêm na oferta).

- Vídeo **H.264** `packetization-mode=1` (de preferência `42e01f`); áudio **Opus** só se o
  mic tiver permissão (pode vir sem m=audio). Mesma checagem de `formats()` do `obs-rtp.js`.
- `201`, corpo = resposta SDP, `Location: /camera/session/<uuid>`. Daqui pra frente é o mesmo
  repasse do OBS local: republica no servidor com as credenciais `pub_` da pessoa.
- Não negociar a extensão `urn:3gpp:video-orientation` na resposta (o repasse descarta as
  extensões RTP; sem ela o celular já manda os quadros girados).
- `401` token desconhecido · `409` o OBS (ou outra câmera) já está transmitindo ·
  `503` fora da sala / sem publicação (`Entre na sala no app`).

### `DELETE /camera/session/<uuid>`
`Authorization: Bearer <token>`. `200`. Encerra a publicação (igual ao OBS local).

## Pareamento por QR

Card **Conectar câmera** em Configurações → Conexão e testes (só no app):

- QR com `wsscam://pair?h=<IPv4s da rede, separados por vírgula>&p=38219&c=<código>`.
  Código: 24 bytes aleatórios em base64url, uso único, vale 10 min (renova ao reabrir).
- Embaixo: `IP: 192.168.0.10` (pra digitar no celular) e a lista de câmeras pareadas com **Remover**.
- Lib de QR sugerida: `qrcode` (npm), gerando SVG/data URL no processo principal.

## Release

No `main`, em `.github/workflows/desktop.yml`, um job que chama o workflow desta branch e
um `needs` a mais no `release` (o `download-artifact` com `merge-multiple` já pega o APK):

```yaml
  camera-apk:
    uses: UsuarioDeJava/web-screen-share/.github/workflows/android.yml@mobile-camera-app
    with:
      version: <versão do desktop/package.json>
      ref: mobile-camera-app
    secrets: inherit

  release:
    needs: [build, camera-apk]
```

E uma linha no corpo do release: **Android**: `WSS-Camera-<versão>.apk` (câmera do celular, conecta no app do PC).
