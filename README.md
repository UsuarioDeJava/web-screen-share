# web-screen-share

Compartilhe a tela de um PC (Windows ou Linux) pelo navegador, e assista de qualquer
outro dispositivo na mesma rede local ou via Tailscale, sem instalar nada além do Node.js.

## Como funciona

- Um servidor Node.js (Express + Socket.io) serve a interface web e faz a sinalização
  WebRTC. Ele escuta em `0.0.0.0`, então fica acessível por qualquer IP da máquina
  (rede local, Tailscale, etc).
- O **transmissor** (`/host.html`) roda no navegador do PC que vai compartilhar a tela
  e usa `getDisplayMedia` para capturar a tela (e, se o navegador permitir, o áudio).
- O **visualizador** (`/`) roda no navegador de quem vai assistir e recebe o vídeo via
  WebRTC (peer-to-peer entre o transmissor e cada visualizador).

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior, no PC que vai transmitir.
- Um navegador baseado em Chromium (Chrome/Edge) é recomendado no transmissor, por ter
  o melhor suporte a captura de áudio do sistema junto com a tela.

## Como rodar

### Linux / macOS

```bash
./start.sh
```

### Windows

Dê dois cliques em `start.bat`, ou pelo PowerShell/CMD:

```bat
start.bat
```

### Manualmente (qualquer SO)

```bash
npm install
npm start
```

Por padrão o servidor sobe na porta `3000`. Para mudar, defina a variável de ambiente
`PORT` antes de iniciar (ex.: `PORT=8080 npm start`).

### Rodando em container (Docker / CasaOS)

Também dá pra rodar o servidor num container, por exemplo num NAS com
[CasaOS](https://casaos.io/). Nesse caso **o servidor roda numa máquina separada** de
quem transmite — ele só serve a página e faz a sinalização; quem efetivamente
compartilha a tela continua sendo o navegador de alguém, abrindo `/host.html` apontando
pro endereço do container.

**Importante:** `getDisplayMedia` (a API que captura a tela) só funciona em "contexto
seguro" — e isso deixa de valer de graça quando o servidor não está mais em
`localhost` pro transmissor (ele passa a acessar pelo IP/hostname do NAS). Por isso,
diferente do `start.sh`/`start.bat`, **a imagem Docker sempre sobe em HTTPS**: se você
não montar um certificado de verdade, ela gera um autoassinado sozinha na primeira vez
(guardado no volume `/data`, não é regenerado nos reinícios seguintes). O navegador vai
mostrar um aviso de segurança na primeira visita — é esperado, clique em
avançar/continuar. Se quiser evitar esse aviso, monte um certificado de verdade (ex.:
gerado com `tailscale cert`, veja a seção abaixo) nas variáveis `TLS_CERT`/`TLS_KEY`.

```bash
docker compose up -d --build
```

Isso sobe o servidor na porta `3000`. Pra importar no CasaOS: **App Store > Instalar um
app personalizado** (ou **Custom Install**) e cole o conteúdo de `docker-compose.yml`
deste repositório, ajustando a porta se já tiver algo usando a 3000. Depois, qualquer
dispositivo acessa `https://<IP-ou-hostname-do-NAS>:3000/`:
- quem for **transmitir** abre `/host.html`;
- quem for **assistir** abre `/` (a raiz).

Pra usar um certificado próprio (sem aviso de segurança), descomente no
`docker-compose.yml` as linhas que montam os arquivos `.crt`/`.key` e as variáveis
`TLS_CERT`/`TLS_KEY`, apontando pros caminhos dentro do container.

### HTTPS via certificado do Tailscale

Se o [Tailscale](https://tailscale.com/) estiver instalado e com os certificados
HTTPS habilitados na sua tailnet (ativado por padrão em contas novas; confira em
`login.tailscale.com/admin/dns` se não funcionar), o `start.sh`/`start.bat` detectam
isso sozinhos, geram um certificado pro nome MagicDNS desta máquina
(`algo.sua-tailnet.ts.net`) com `tailscale cert`, e sobem o servidor em HTTPS
automaticamente — não precisa fazer nada além de rodar o script normalmente.

Isso importa porque alguns navegadores restringem WebRTC (ou simplesmente se
comportam de forma inconsistente) em páginas servidas por HTTP simples; HTTPS evita
essa categoria de problema por completo. Se um visualizador específico não conseguir
conectar mesmo com HTTPS ativo, o problema é outra coisa (veja a seção de TURN logo
abaixo e as observações no fim deste arquivo).

Pra gerar o certificado manualmente (ou se a detecção automática falhar):

```bash
tailscale status --json   # confirme o DNSName em "Self"
tailscale cert algo.sua-tailnet.ts.net
TLS_CERT="$(pwd)/algo.sua-tailnet.ts.net.crt" TLS_KEY="$(pwd)/algo.sua-tailnet.ts.net.key" npm start
```

Quem for assistir deve acessar pelo nome MagicDNS, não pelo IP (`https://algo.sua-tailnet.ts.net:3000/`) — o certificado só é válido para esse nome.

Ao iniciar, o terminal mostra os endereços disponíveis, por exemplo:

```
Servidor rodando em http://0.0.0.0:3000
  - No próprio PC (transmissor): http://localhost:3000/host.html
  - Para outros dispositivos na LAN/Tailscale, use um dos endereços abaixo:
      http://192.168.0.42:3000/
      http://100.x.y.z:3000/   <- IP do Tailscale, se estiver ativo
```

Com HTTPS ativo, aparece `https://` no lugar e uma nota confirmando que está usando o
certificado do Tailscale.

### Servidor TURN (para conexões atrás de NAT/firewall mais restritivo)

O WebRTC tenta primeiro conectar diretamente entre transmissor e visualizador. Quando
isso não é possível (firewall, antivírus ou NAT mais fechado em um dos lados), é
preciso um servidor **TURN** para retransmitir a mídia — sem ele, a conexão fica presa
em "conectando" para sempre. Por padrão o projeto já usa um TURN público de testes
([OpenRelay](https://www.metered.ca/tools/openrelay/)), suficiente para uso pessoal
esporádico. Para algo mais confiável (ou privado), rode seu próprio
[coturn](https://github.com/coturn/coturn) e configure:

```bash
TURN_URLS="turn:seu-servidor:3478,turn:seu-servidor:3478?transport=tcp" \
TURN_USERNAME=usuario \
TURN_CREDENTIAL=senha \
npm start
```

## Uso

1. No PC que vai transmitir, abra `http://localhost:3000/host.html` e clique em
   **"Iniciar transmissão"**. Escolha a tela/janela a compartilhar no prompt do
   navegador.
2. Em outro dispositivo (celular, notebook) na mesma LAN ou conectado via Tailscale,
   abra `http://<IP-do-PC>:3000/`. O vídeo aparece automaticamente assim que a
   transmissão começa.
3. Cada visualizador pode, independentemente:
   - **Ativar/desativar o som** com o botão na barra inferior (o som começa desligado
     por padrão, pois os navegadores bloqueiam áudio automático sem interação do
     usuário).
   - **Trocar a qualidade** (Alta / Média / Baixa / Mínima) no seletor da barra
     inferior, para reduzir resolução, taxa de quadros e bitrate caso a internet
     esteja fraca. Isso ajusta a transmissão apenas para aquele visualizador,
     sem afetar os demais.

## Observações

- `getDisplayMedia` exige um "contexto seguro". Rodando com `start.sh`/`start.bat`
  (transmissor e servidor na mesma máquina), isso funciona mesmo sem HTTPS porque o
  transmissor acessa via `localhost`. Já no Docker (servidor numa máquina separada,
  veja acima), o transmissor NÃO está mais em `localhost`, então HTTPS passa a ser
  obrigatório pra captura funcionar — por isso a imagem Docker sempre sobe em HTTPS.
  Os visualizadores não precisam de contexto seguro pra WebRTC em si, mas HTTPS evita
  restrições extras que alguns navegadores aplicam em páginas HTTP simples.
- Captura de áudio do sistema junto com a tela depende do navegador/SO (no Windows,
  o Chrome geralmente permite ao compartilhar a tela inteira; no Linux o suporte é
  mais limitado). Se não for possível, a transmissão segue apenas com vídeo.
- Para acesso fora da rede local, use [Tailscale](https://tailscale.com/) (ou outra
  VPN) e acesse pelo IP dela — não é necessário abrir portas no roteador.
- Apenas um transmissor é suportado por vez; se outra aba/janela iniciar como
  transmissor, a anterior é avisada e desligada.
- Se um visualizador ficar travado em "sinal recebido, conectando mídia..." (tela
  preta, sem nunca virar "transmissão ativa" nem mostrar erro), é sinal de que a
  conexão direta (P2P) não está conseguindo se estabelecer para aquele dispositivo —
  normalmente firewall/antivírus bloqueando UDP ou NAT restritivo. O app já tenta usar
  o TURN de fallback (veja acima) e reconecta automaticamente a cada tentativa; se
  mesmo assim continuar preso, vale configurar um TURN próprio, já que o público tem
  banda limitada e é compartilhado. Note que qualquer TURN faz o vídeo passar por um
  relay de terceiros quando a conexão direta falha — para privacidade total, use um
  TURN próprio em vez do público padrão.
