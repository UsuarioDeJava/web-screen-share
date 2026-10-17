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

- `getDisplayMedia` exige um "contexto seguro". Como o transmissor sempre acessa via
  `localhost`, isso funciona mesmo sem HTTPS. Os visualizadores não precisam de
  contexto seguro pra WebRTC em si, mas HTTPS (via Tailscale, veja acima) evita
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
