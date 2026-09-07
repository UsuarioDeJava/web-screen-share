# web-screen-share

Transmita a tela do seu PC (Windows ou Linux, **incluindo Wayland/KDE** — Bazzite,
Fedora, etc.) usando o **OBS Studio**, e assista de qualquer outro dispositivo da rede
pelo **VLC** ou por um navegador.

## Por que OBS em vez de captura direta?

Uma versão anterior deste projeto tentava capturar a tela direto com `ffmpeg`
(`x11grab`). Isso não funciona em sessões **Wayland** (padrão no KDE Plasma de
distros como o Bazzite): a tela aparece preta, só o cursor do mouse se move, porque
`x11grab` só enxerga o X11/XWayland, não o compositor Wayland de verdade.

O OBS resolve isso porque usa o **portal de captura de tela do próprio sistema**
(o mesmo mecanismo do botão "Compartilhar tela" nativo), funcionando tanto em X11
quanto em Wayland — e já vem com controle de bitrate/qualidade/áudio numa interface
gráfica, então não precisamos reinventar nada disso.

## Como funciona

- **[MediaMTX](https://github.com/bluenviron/mediamtx)** é um servidor de streaming
  (binário único, sem dependências) que fica escutando em `0.0.0.0`. O `start.sh` /
  `start.bat` baixa ele sozinho na primeira vez e sobe o servidor.
- O **OBS** transmite a tela pra esse servidor via RTMP, usando a opção "Serviço:
  Personalizado" (a mesma tela que se usaria pra transmitir pra Twitch/YouTube, só
  que apontando pro seu próprio PC em vez de um serviço externo).
- Quem for assistir abre o endereço direto no **VLC** (RTSP) ou num **navegador**
  (HLS) — o servidor serve os dois automaticamente, sem configuração extra.

## Requisitos

- **No PC que transmite:** [OBS Studio](https://obsproject.com/) instalado. Nada
  além disso — o `start.sh`/`start.bat` cuida do servidor.
- **Em quem vai assistir:** [VLC](https://www.videolan.org/vlc/) ou um navegador
  qualquer.

## Como usar

### 1. Suba o servidor

**Linux:**
```bash
./start.sh
```

**Windows:** dê dois cliques em `start.bat`, ou rode pelo CMD/PowerShell.

Na primeira vez ele baixa o MediaMTX automaticamente. O terminal mostra algo assim:

```
=== No PC que transmite: configure o OBS ===
Configurações > Transmissão > Serviço: Personalizado...
  Servidor:             rtmp://localhost:1935
  Chave de transmissão: screen

=== Para assistir de outro dispositivo na LAN/Tailscale ===
  VLC (Mídia > Abrir Transmissão de Rede):
      rtsp://192.168.0.42:8554/screen
  Navegador:
      http://192.168.0.42:8888/screen/index.m3u8
```

### 2. Configure o OBS (uma vez só)

No PC que vai transmitir, com o OBS aberto:

1. **Configurações > Transmissão**
2. **Serviço:** `Personalizado...`
3. **Servidor:** `rtmp://localhost:1935` (exatamente como o terminal mostrou)
4. **Chave de transmissão:** `screen`
5. Adicione uma fonte de **Captura de Tela** na sua cena (funciona no Wayland/KDE
   normalmente, incluindo áudio do sistema via a fonte de áudio "Saída de Áudio
   Desktop" que o OBS já cria por padrão).
6. Clique em **Iniciar Transmissão**.

### 3. Assista de outro dispositivo

- **VLC:** Mídia > Abrir Transmissão de Rede (`Ctrl+N`) > cole o endereço
  `rtsp://<IP-do-PC>:8554/screen` mostrado no terminal > Reproduzir.
- **Navegador:** abra direto `http://<IP-do-PC>:8888/screen/index.m3u8` (o Chrome
  não toca `.m3u8` nativamente — funciona bem no Safari/iOS; no Chrome/Firefox use o
  VLC, ou toque no link com um player compatível com HLS).

## Configurações (variáveis de ambiente)

| Variável      | Padrão   | O que faz                                              |
|---------------|----------|---------------------------------------------------------|
| `RTMP_PORT`   | `1935`   | Porta onde o OBS publica.                                |
| `RTSP_PORT`   | `8554`   | Porta RTSP pro VLC.                                      |
| `HLS_PORT`    | `8888`   | Porta HLS pro navegador.                                 |
| `STREAM_KEY`  | `screen` | Nome do "canal" — use o mesmo valor no OBS e na URL de quem assiste. |

Exemplo, se a porta 8080 já estiver em uso por outra coisa:

```bash
RTMP_PORT=19350 RTSP_PORT=8555 HLS_PORT=8889 ./start.sh
```

## Qualidade / internet fraca

Como quem controla o encode agora é o OBS, ajuste a qualidade direto nele:
**Configurações > Saída > (modo Avançado) > Transmissão** — baixe o **bitrate de
vídeo** (ex.: 800 kbps) e a **resolução de saída** (Configurações > Vídeo) se a
internet de quem for assistir estiver fraca. Isso já evita o problema clássico de
bitrate alto demais pra internet: tela travada com só o cursor "pulando".

## Limitações

- Suporta múltiplos espectadores simultâneos (diferente da versão anterior baseada só
  em ffmpeg) — o MediaMTX foi feito pra isso.
- Roda em qualquer rede que alcance essas portas (LAN, Tailscale). Pra internet
  "de verdade" fora dessas redes, normalmente precisa abrir porta no roteador ou usar
  uma VPN como o Tailscale.
- O arquivo `mediamtx.yml` gerado na primeira execução fica no `.gitignore` — se
  quiser mexer em configurações mais avançadas do MediaMTX, edite esse arquivo direto
  (veja a [documentação](https://mediamtx.org/docs)).
