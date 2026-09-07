# web-screen-share

Transmita a tela do seu PC (Windows ou Linux) pela rede, e assista de qualquer outro
dispositivo — celular, notebook, outro PC — abrindo o endereço direto no **VLC**.
Não precisa de navegador, site, nem instalar nada além do **FFmpeg** no PC que
transmite.

## Como funciona

Um único script chama o `ffmpeg` pra capturar sua tela (e o áudio do sistema, quando
disponível) e servir isso como um stream de vídeo (MPEG-TS) num servidor HTTP simples,
escutando em `0.0.0.0` — acessível por qualquer IP da máquina (rede local, Tailscale,
etc). Do outro lado, o VLC conecta direto nesse endereço, sem precisar de nenhum app
ou site intermediário.

## Requisitos

- **No PC que transmite:** [FFmpeg](https://ffmpeg.org/download.html) instalado e no
  PATH.
  - Linux: `sudo apt install ffmpeg` (Debian/Ubuntu/Mint) ou o gerenciador de pacotes
    da sua distro.
  - Windows: baixe um build em https://www.gyan.dev/ffmpeg/builds/, extraia e adicione
    a pasta `bin` ao PATH.
- **Em quem vai assistir:** [VLC](https://www.videolan.org/vlc/) (ou qualquer player
  que abra streams de rede, como o mpv).

## Como transmitir

### Linux

```bash
./start.sh
```

### Windows

Dê dois cliques em `start.bat`, ou rode pelo CMD/PowerShell:

```bat
start.bat
```

O terminal mostra os endereços pra usar, por exemplo:

```
Transmitindo sua tela em http://0.0.0.0:8080
No VLC de outro dispositivo: Mídia > Abrir Transmissão de Rede > cole um destes endereços:
    http://192.168.0.42:8080
    http://100.x.y.z:8080   <- IP do Tailscale, se estiver ativo
```

## Como assistir

1. Abra o **VLC** no dispositivo que vai assistir.
2. Vá em **Mídia > Abrir Transmissão de Rede** (`Ctrl+N`).
3. Cole o endereço mostrado no terminal (ex.: `http://192.168.0.42:8080`).
4. Clique em **Reproduzir**. Pode levar alguns segundos pra imagem aparecer (é normal,
   é o tempo de o VLC sincronizar com o início do stream).

## Configurações (variáveis de ambiente)

| Variável        | Padrão | O que faz                                                        |
|-----------------|--------|-------------------------------------------------------------------|
| `PORT`          | `8080` | Porta do servidor HTTP.                                           |
| `FRAMERATE`     | `30`   | Quadros por segundo capturados.                                   |
| `VIDEO_BITRATE` | `2M`   | Bitrate do vídeo (também usado como teto de pico e buffer). Se a internet de quem assiste for fraca, baixe pra `1M`, `500k` ou menos antes de iniciar — é o ajuste que mais importa. |
| `VIDEO_SIZE`    | (auto) | Só Linux. Força uma resolução específica (ex.: `1280x720`) em vez de capturar a tela inteira. |
| `AUDIO_SOURCE`  | (auto) | Só Linux. Nome da fonte PulseAudio a capturar. Use `pactl list short sources` pra listar; o script já tenta detectar o monitor do áudio padrão sozinho. |
| `AUDIO_DEVICE`  | (nenhum) | Só Windows. Nome exato do dispositivo de captura de áudio (ver abaixo). |

Exemplo, pra internet fraca:

```bash
VIDEO_BITRATE=800k FRAMERATE=15 ./start.sh
```

## Áudio do sistema

- **Linux:** o script detecta sozinho o monitor do dispositivo de áudio padrão
  (via PulseAudio/PipeWire) e já transmite com som, se existir. Se não pegar
  automaticamente, rode `pactl list short sources`, ache a linha terminada em
  `.monitor` e force com `AUDIO_SOURCE=nome ./start.sh`.
- **Windows:** o FFmpeg não consegue captar o áudio do sistema sozinho — é preciso
  habilitar o **"Mixagem Estéreo"** (Stereo Mix) nos dispositivos de gravação do
  Windows, ou instalar um cabo de áudio virtual (ex.: VB-Audio Virtual Cable). Depois,
  descubra o nome exato do dispositivo com:
  ```bat
  ffmpeg -f dshow -list_devices true -i dummy
  ```
  e rode com `set AUDIO_DEVICE=Nome Exato do Dispositivo` antes do `start.bat`. Sem
  isso, a transmissão sai só com vídeo.

## Limitações (é o jeito mais simples, então tem trade-offs)

- **Um espectador por vez.** O servidor HTTP embutido do FFmpeg aceita uma conexão de
  cada vez; quando alguém desconecta, o script reinicia sozinho e já fica pronto pra
  o próximo. Não dá pra duas pessoas assistindo ao mesmo tempo com esse esquema.
- **Sem controles na tela** (mudo, qualidade) — use o próprio controle de volume do
  VLC pra mutar/ajustar o som, e as variáveis `VIDEO_BITRATE`/`FRAMERATE` acima (antes
  de iniciar a transmissão) se a internet de quem for assistir estiver fraca.
- Funciona bem em LAN/Tailscale. Pra internet "de verdade" (redes públicas/lentas),
  pode ter mais delay/travamentos que uma solução com buffer adaptativo.
- **Se o vídeo aparecer travado/lag extremo, tipo só o cursor do mouse "pulando" pela
  tela parada** — é o link de quem assiste não aguentando o `VIDEO_BITRATE` configurado
  (o TCP vai acumulando dados atrasados em vez de descartar, então tudo fica cada vez
  mais "no passado"). Baixe `VIDEO_BITRATE` (e opcionalmente `FRAMERATE`) até caber no
  link real da pessoa — não tem como adivinhar esse número, é tentativa e erro:
  ```bash
  VIDEO_BITRATE=500k FRAMERATE=15 ./start.sh
  ```
