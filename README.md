# web-screen-share

Uma sala de compartilhamento de tela pelo navegador, tipo um mini Discord só pra
transmissão (sem voz nem câmera): cada pessoa entra com um nick, pode compartilhar a
própria tela e assistir as telas dos outros, tudo na mesma página. Funciona na rede
local ou via Tailscale, sem instalar nada além do Node.js (ou via Docker).

## Como funciona

- Um servidor Node.js (Express + Socket.io) serve a interface web e faz a sinalização
  WebRTC. Ele escuta em `0.0.0.0`, então fica acessível por qualquer IP da máquina
  (rede local, Tailscale, etc).
- Todo mundo abre a mesma página (`/`), escolhe um nick (sem senha, vale só enquanto
  estiver na sala) e entra na sala.
- Quem clica em **Compartilhar tela** usa `getDisplayMedia` pra capturar a tela (e, se
  o navegador permitir, o áudio). O vídeo vai direto (peer-to-peer, via WebRTC) do
  navegador de quem transmite pro de cada pessoa que está assistindo; o servidor só
  apresenta um pro outro.
- Várias pessoas podem transmitir ao mesmo tempo. Cada transmissão vira um quadro na
  tela, com som, volume e qualidade controlados individualmente por quem assiste.
- Na imagem Docker também dá pra transmitir pelo **OBS Studio** (WHIP): a transmissão
  entra na sala como mais uma pessoa ao vivo, com a etiqueta **OBS** (veja
  [Transmitindo pelo OBS Studio](#transmitindo-pelo-obs-studio)).

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
compartilha a tela continua sendo o navegador de cada pessoa, abrindo a página pelo
endereço do container.

A imagem é publicada automaticamente em `ghcr.io/usuariodejava/web-screen-share` a
cada mudança no código ([.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)).
**Passo único depois do primeiro build:** o GitHub cria o pacote como privado por
padrão, o que bloqueia o `docker pull` anônimo que o CasaOS (e o `docker compose`
em geral) faz. Deixe-o público em
`github.com/users/UsuarioDeJava/packages/container/web-screen-share/settings` >
"Danger Zone" > **Change visibility** > **Public**. Sem isso o CasaOS mostra erro
tipo "No such image" ou "unauthorized" ao tentar instalar.

A loja do CasaOS (pasta `casaos-store/`) é publicada no GitHub Pages por
[.github/workflows/casaos-store.yml](.github/workflows/casaos-store.yml). **Passo único:**
em `github.com/UsuarioDeJava/web-screen-share/settings/pages`, em "Build and deployment" >
**Source**, escolha **GitHub Actions** (o workflow não consegue ativar isso sozinho).

**Importante:** `getDisplayMedia` (a API que captura a tela) só funciona em "contexto
seguro" — e ninguém acessa o NAS via `localhost`, todo mundo usa o IP/hostname dele.
Por isso, diferente do `start.sh`/`start.bat`, **a imagem Docker sempre sobe em
HTTPS**: se você
não montar um certificado de verdade, ela gera um autoassinado sozinha na primeira vez
(guardado no volume `/data`, não é regenerado nos reinícios seguintes). O navegador vai
mostrar um aviso de segurança na primeira visita — é esperado, clique em
avançar/continuar. Pra evitar esse aviso, use um certificado de verdade, como o do
Tailscale (veja [Certificado do Tailscale no container](#certificado-do-tailscale-no-container)).

#### No CasaOS, pela loja própria (recomendado: atualiza com um clique)

Este repositório também funciona como uma fonte de apps do CasaOS
([casaos-store/](casaos-store/Apps/web-screen-share/docker-compose.yml)). Adicionando
essa fonte, o app aparece na loja e o CasaOS sabe de onde ele vem, o que libera a
atualização direto pela interface:

1. No CasaOS, abra a **App Store**, clique em **+ Mais aplicativos** (*More apps*),
   cole o endereço abaixo e clique em **Adicionar**. Na lista de fontes ela aparece
   como **web-screen-share**:

   ```
   https://usuariodejava.github.io/web-screen-share/store.zip
   ```

2. Procure **Web Screen Share** na loja e instale. Depois, todo mundo acessa
   `https://<IP-ou-hostname-do-NAS>:3000/`.
3. Pra atualizar: no menu (três pontinhos) do ícone do app, clique em **Verificar e
   atualizar**. O CasaOS baixa a imagem mais recente e recria o container, mantendo as
   configurações. Ele também confere sozinho, a cada ~10 minutos, se a imagem publicada
   mudou. A versão instalada (`versão AAAA.MM.DD-commit`) aparece na tela de entrada e
   embaixo da lista de pessoas; quem estava com a página aberta durante a atualização
   vê um aviso pra recarregar.

Se você já tinha instalado colando o `docker-compose.yml` ("app personalizado"),
desinstale essa versão antes de instalar pela loja: apps instalados assim não ficam
ligados a nenhuma loja, então o **Verificar e atualizar** deles não tem de onde
atualizar. A única coisa perdida é o certificado autoassinado, que é gerado de novo
(cada dispositivo aceita o aviso de segurança mais uma vez).

#### Com Docker Compose (ou "app personalizado" no CasaOS)

```bash
docker compose up -d
```

Isso baixa a imagem já publicada (`ghcr.io/usuariodejava/web-screen-share`) e sobe o
servidor na porta `3000`. Também dá pra importar no CasaOS sem a loja: **App Store >
Instalar um app personalizado** (ou **Custom Install**) e cole o conteúdo de
`docker-compose.yml` deste repositório, ajustando a porta se já tiver algo usando a
3000 — mas aí as atualizações precisam ser feitas na mão (`docker compose pull && docker
compose up -d`, ou reinstalando).

#### Trocando a porta, ou abrindo por um proxy (Caddy, nginx…)

A porta não depende de rebuild nem de variável: quem escolhe é o lado **Host** do
mapeamento. No CasaOS, em **Configurações** do app > **Portas**, troque o número do
**Host** nas duas linhas (a TCP, que vai pro container `3000`, e a UDP, que vai pro
`3478`), sempre com **o mesmo número** nas duas, e ajuste a porta do **Web UI**. O lado
**Container** fica como está. O app se ajusta sozinho à porta usada pra abrir a página.

Se você abre a página por um **proxy reverso** numa porta diferente (ex.: um Caddy que
publica `https://nas...:33100` na frente do app em `:3100`), o site e o OBS funcionam
pelo proxy, mas o TURN não: ele não é HTTP e não atravessa o proxy. Nesse caso defina
a variável **`PUBLIC_PORT`** com a porta em que o app está publicado direto no servidor
(no exemplo, `3100`), e o TURN passa a ir direto nela, por TCP e UDP. No CasaOS: em
**Configurações** do app > **Variáveis de ambiente**, adicione `PUBLIC_PORT` = `3100` e
salve. Sem isso, quem abre a página pelo proxy vê um aviso no topo da sala, e quem
depende do TURN pra assistir (e o OBS) pode não conectar.

#### Certificado do Tailscale no container

Com um certificado de verdade o navegador não mostra aviso de segurança. O container
procura sozinho, na pasta de dados dele, um par de arquivos `NOME.crt` + `NOME.key`
(o formato que o `tailscale cert` gera) e usa esse no lugar do autoassinado. No
CasaOS (instalado pela loja), a pasta de dados é **`/DATA/AppData/web-screen-share/data`**.

1. O certificado precisa ser **do NAS** (a máquina onde o container roda), pro nome
   dele no Tailscale (`nome-do-nas.sua-tailnet.ts.net`, que aparece no `tailscale
   status` ou no painel do Tailscale). Um certificado gerado no seu PC vale pro nome
   do PC e não serve. No terminal do NAS, dá pra gerar já direto na pasta certa:

   ```bash
   sudo tailscale cert \
     --cert-file /DATA/AppData/web-screen-share/data/nas.crt \
     --key-file /DATA/AppData/web-screen-share/data/nas.key \
     nome-do-nas.sua-tailnet.ts.net
   ```

   Ou copie pra essa pasta um par `.crt` + `.key` que você já tenha (com o mesmo nome
   antes da extensão).
2. Reinicie o app. No log aparece `Usando o certificado ...`, pra qual nome ele vale e
   quando expira. Se a chave não for desse certificado, o log avisa e o app continua
   com o autoassinado.
3. Acesse **pelo nome**, não pelo IP: `https://nome-do-nas.sua-tailnet.ts.net:3000/`.
   O certificado só vale pra esse nome.

Os certificados do Tailscale valem cerca de 90 dias. Antes de vencer, repita o passo 1
e reinicie o app. Quando faltarem 30 dias ou menos (ou se já tiver vencido), a própria
página avisa todo mundo que abrir, na tela de entrada e no topo da sala, e o log também.

Alternativa no `docker-compose.yml`: montar os arquivos em outro caminho e apontar as
variáveis `TLS_CERT`/`TLS_KEY` pra eles (linhas comentadas no arquivo). Se definidas,
elas têm prioridade.

Se preferir compilar a imagem você mesmo em vez de baixar a pronta (precisa clonar
este repositório primeiro), troque a linha `image:` do `docker-compose.yml` por
`build: .` e rode `docker compose up -d --build`.

### HTTPS via certificado do Tailscale

Se o [Tailscale](https://tailscale.com/) estiver instalado e com os certificados
HTTPS habilitados na sua tailnet (ativado por padrão em contas novas; confira em
`login.tailscale.com/admin/dns` se não funcionar), o `start.sh`/`start.bat` detectam
isso sozinhos, geram um certificado pro nome MagicDNS desta máquina
(`algo.sua-tailnet.ts.net`) com `tailscale cert`, e sobem o servidor em HTTPS
automaticamente — não precisa fazer nada além de rodar o script normalmente.

Isso importa porque, sem HTTPS, **só quem abre a página pelo `localhost` (o próprio PC
que roda o servidor) consegue compartilhar a tela** — nos outros PCs o botão fica
indisponível e a pessoa só consegue assistir. HTTPS também evita restrições extras que
alguns navegadores aplicam a WebRTC em páginas HTTP simples. Se alguém específico não
conseguir conectar mesmo com HTTPS ativo, o problema é outra coisa (veja a seção de
TURN logo abaixo e as observações no fim deste arquivo).

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
  - Neste PC: http://localhost:3000/
  - De outros dispositivos na LAN/Tailscale, use um dos endereços abaixo:
      http://192.168.0.42:3000/
      http://100.x.y.z:3000/   <- IP do Tailscale, se estiver ativo
```

Com HTTPS ativo, aparece `https://` no lugar e uma nota confirmando que está usando o
certificado do Tailscale.

### Servidor TURN (para conexões atrás de NAT/firewall mais restritivo)

O WebRTC tenta primeiro conectar diretamente entre transmissor e visualizador. Quando
isso não é possível (firewall, antivírus, NAT mais fechado, ou o navegador escondendo o
próprio IP de quem não está transmitindo), é preciso um servidor **TURN** para
retransmitir a mídia; sem ele, a conexão fica presa em "conectando".

**Na imagem Docker isso já vem pronto:** ela traz um [coturn](https://github.com/coturn/coturn)
que atende na **mesma porta do site** (3000), então pros navegadores não precisa publicar
porta nenhuma a mais. O servidor separa as conexões TURN das do site pelo primeiro
pacote. (A porta 3000/UDP só é necessária pra [transmitir pelo OBS](#transmitindo-pelo-obs-studio).) Esse TURN só
retransmite entre pessoas da própria sala (não serve de ponte pra sua rede local nem pra
internet) e usa credenciais temporárias geradas pelo servidor. Quando ele é usado, o
vídeo passa pelo NAS; o botão **(i)** do quadro mostra "via servidor TURN".

Fora do Docker (`start.sh`/`start.bat`), o projeto usa por padrão um TURN público de
testes ([OpenRelay](https://www.metered.ca/tools/openrelay/)). Pra algo mais confiável,
rode seu próprio [coturn](https://github.com/coturn/coturn) e configure:

```bash
TURN_URLS="turn:seu-servidor:3478,turn:seu-servidor:3478?transport=tcp" \
TURN_USERNAME=usuario \
TURN_CREDENTIAL=senha \
npm start
```

### Transmitindo pelo OBS Studio

Na imagem Docker, além de compartilhar a tela pelo navegador, dá pra transmitir pelo
[OBS Studio](https://obsproject.com/) 30 ou mais novo. Serve pra quem usa um navegador
que não compartilha o áudio (Firefox, Zen…) ou pra mandar uma cena montada no OBS. A
transmissão aparece na sala como mais uma pessoa ao vivo, com a etiqueta **OBS**, e
todo mundo assiste normalmente (com som e volume próprios).

No OBS, em **Configurações > Transmissão**:

- **Serviço:** `WHIP`
- **Servidor:** `https://<endereço-do-servidor>:3000/obs/SEU-NICK` (o final do endereço
  é o nome com que você aparece na sala)
- **Bearer Token:** em branco, ou qualquer coisa (não é conferido: como a própria sala,
  entra quem alcança o servidor)

Depois é só **Iniciar transmissão**. Se você estiver na sala com o mesmo nick, a
transmissão aparece na sua própria linha da lista (com a etiqueta OBS), sem criar outra
pessoa. O botão **OBS** no topo da sala mostra esse
endereço já com o seu nick, pronto pra copiar, e testa se a porta UDP está liberada. Em
**Configurações > Saída**, um codificador H.264, uns 6000 Kbps e intervalo de
quadro-chave de 1 s funcionam bem (o intervalo curto faz quem entra no meio começar a
ver mais rápido).

Duas coisas precisam estar certas no servidor:

- **Certificado de verdade.** O OBS não aceita o certificado autoassinado; use o do
  Tailscale (veja [Certificado do Tailscale no container](#certificado-do-tailscale-no-container))
  e o endereço com o nome dele (`https://nas.seu-tailnet.ts.net:3000/obs/...`).
- **Porta 3000/UDP publicada** apontando pra porta 3478/UDP do container. O OBS manda o
  vídeo pelo TURN embutido, e ele só sabe usar TURN por UDP. O `docker-compose.yml` e a
  loja já publicam essa porta em instalações novas. **Se o app já estava instalado**
  (o "Verificar e atualizar" do CasaOS troca a imagem, mas não mexe nas portas): no
  CasaOS, abra as **Configurações** do app, em **Portas** clique em **+ Adicionar**,
  preencha **Host** `3000`, **Container** `3478`, **Protocolo** `UDP` e salve. Se o site
  usa outra porta no host, use esse mesmo número na porta UDP.

Quem assiste precisa de um navegador que decodifique **H.264**, o formato de vídeo
que o OBS manda. Chrome, Edge e Safari decodificam. O Firefox (e derivados, como o Zen)
depende do plugin OpenH264: se ele não estiver ativo, o quadro do OBS mostra um aviso
explicando isso. Ative em `about:addons` > **Plugins** > **OpenH264** e reinicie o
navegador, ou assista pelo Chrome/Edge.

Por dentro: o servidor repassa a transmissão pra um [MediaMTX](https://github.com/bluenviron/mediamtx)
embutido no container, e quem assiste puxa o vídeo dele (WHEP), pelo mesmo TURN. Ou
seja, diferente do compartilhamento pelo navegador, o OBS envia uma cópia só, pro
servidor, e o NAS manda uma cópia pra cada pessoa assistindo.

## Uso

1. Todo mundo abre o endereço do servidor (ex.: `https://<IP-ou-hostname>:3000/`),
   digita um nick e clica em **Entrar**. Se o nick já estiver em uso, o servidor
   acrescenta um número (ex.: `Ana (2)`).
2. Pra transmitir, clique em **Compartilhar tela** no topo e escolha a tela/janela no
   prompt do navegador. Seu quadro aparece com a etiqueta **AO VIVO**, o tempo no ar e
   um contador de quantas pessoas estão assistindo (passe o mouse nele pra ver quem).
   Clique em **Parar transmissão** (ou no botão nativo do navegador) pra encerrar.
3. Quando alguém começa a transmitir, o quadro abre sozinho, mas **sem som** (o
   alto-falante do quadro fica vermelho): clique nele pra ouvir. Se a sua conexão cair
   e voltar (ou o app for atualizado), ou se a transmissão cair e voltar em até
   1 minuto (ex.: o OBS reconectando), cada quadro volta do jeito que você deixou: com
   ou sem som, volume, qualidade, fixado em destaque ou fechado no X. Clicar no nome
   de quem está transmitindo, na lista de pessoas, leva até o quadro.
4. Em cada quadro, quem assiste controla só pra si mesmo, sem afetar os outros:
   - **Som e volume**: botão do alto-falante pra mutar/desmutar e barra de volume ao
     lado (no iPhone/iPad só o mute funciona, o iOS não deixa sites mudarem o volume).
   - **Reagir** (carinha, na barra de baixo): 🔥 😂 😮 👏 ❤️ 💀 sobem por cima do vídeo,
     com o seu nome, pra todo mundo que está vendo aquela transmissão, inclusive quem
     transmite.
   - **Print** (câmera, na barra de baixo): salva a imagem atual da transmissão em PNG,
     na resolução que está chegando.
   - Ao lado do nome, o tempo que a transmissão está no ar.
   - Passando o mouse sobre o vídeo (no celular fica sempre visível):
     - **Qualidade** (Alta / Média / Baixa / Mínima): reduz resolução, quadros e taxa
       de bits que aquela pessoa te envia, útil com internet fraca.
     - **(i) Estatísticas**: estado da conexão, se ela é direta ou via TURN,
       resolução, fps, taxa e latência. Em transmissões do OBS, mostra também o trecho
       do OBS até o servidor: pacotes perdidos (no último segundo e no total), pedaços
       de vídeo descartados por causa deles e a taxa chegando. Perda ali deixa a imagem "derretida" pra todo mundo
       até o próximo quadro-chave do OBS; se a imagem derrete sem perdas, o problema
       está no codificador de quem transmite (placa de vídeo sobrecarregada, por
       exemplo).
     - **Fixar** (alfinete): deixa aquele quadro grande e as outras transmissões
       menores do lado (ou embaixo, em telas estreitas e no celular), todas
       continuando a tocar. Clique de novo pra desafixar; só um quadro fica fixado
       por vez, e fixar outro troca o destaque.
     - **Picture-in-picture**: a transmissão vira uma janelinha que fica por cima de
       tudo, pra continuar vendo enquanto usa outro programa (Chrome e Edge).
     - **Tela cheia** (ou dois cliques no vídeo). Em tela cheia o vídeo ocupa tudo: a
       barra de baixo (nome, som e volume) fica escondida e aparece ao encostar o mouse
       na borda de baixo da tela, como a barra de tarefas do Windows com ocultar
       automático; os botões de cima e o cursor somem com o mouse parado. No celular,
       um toque mostra tudo por alguns segundos. Quando o mouse sai da janela (por
       exemplo, indo pra outro monitor) ou você clica em outro programa, tudo que
       aparece por cima do vídeo some na hora, inclusive a lista de pessoas.
     - **X — parar de assistir**: desliga aquela transmissão pra você (economiza
       banda) e tira o quadro da tela, sobrando espaço pras outras. Pra voltar, é o
       botão **Assistir** que aparece no nome da pessoa, na lista de pessoas (o
       botão de pessoas no topo ganha um pontinho vermelho enquanto houver alguma
       transmissão que você parou de assistir).
5. Na imagem Docker, o botão **OBS** no topo mostra como transmitir pelo OBS Studio
   (veja [Transmitindo pelo OBS Studio](#transmitindo-pelo-obs-studio)). Transmissões
   do OBS não têm o seletor de qualidade: a qualidade é a configurada no próprio OBS.
6. **Lista de pessoas**: no computador ela não ocupa espaço, pra sobrar mais tela
   pras transmissões. Ela aparece por cima ao encostar o mouse na borda esquerda da
   janela (e some quando o mouse sai), ou pelo botão com o número de pessoas no topo,
   que deixa ela aberta até clicar fora, apertar Esc ou clicar em «. No celular ela
   fica numa faixa no topo. Se a conexão com o servidor cair, o aviso "Reconectando…"
   aparece também no topo.
7. **Sair** (ícone no rodapé da lista de pessoas) volta pra tela de nick. Do lado
   dele, o **sino** liga e desliga os sons da sala (alguém entrou ou saiu, começou a
   transmitir, mensagem nova no chat, alguém te marcou ou apontou na tela).
8. **Testar conexão** (no rodapé da lista de pessoas): quando alguém não consegue
   assistir, isso testa, no navegador dessa pessoa, o TURN do servidor por UDP e por
   TCP, uma conexão completa por ele, se o navegador decodifica H.264 (o formato do
   OBS) e a conexão com uma transmissão do OBS que estiver no ar. O botão **Copiar
   resultado** copia tudo pra mandar pra quem cuida do servidor.
9. **Chat** (botão no topo, ou tecla **C**): abre do lado das transmissões (embaixo
   delas no celular). Links viram clicáveis, mensagens com `@seu-nick` ficam
   destacadas pra você, e quem entra, sai ou começa a transmitir aparece numa linha
   cinza. Com o chat fechado, o botão e o título da aba mostram quantas mensagens
   você não leu. Quem entra depois vê as últimas 100 mensagens; na imagem Docker
   elas ficam salvas em `chat.json`, na pasta de dados, e continuam lá depois de
   atualizar o app. Em tela cheia, as mensagens novas aparecem por cima do vídeo e o
   **Enter** abre um campo pra responder sem sair da tela cheia.
10. **Apontar e desenhar na tela**: **Alt + clique** num ponto do vídeo (no celular:
    tocar e segurar) mostra um sinal com o seu nome naquele ponto; **Alt + arrastar**
    (no celular: segurar e arrastar) desenha, na sua cor, pra circular ou riscar
    alguma coisa. O traço aparece pros outros ao vivo, enquanto você ainda está
    desenhando, e some sozinho uns segundos depois de soltar. Vale pra todo mundo que
    está vendo a transmissão, inclusive quem transmite (que também pode marcar a
    própria tela, pra mostrar algo pra quem assiste).
11. **Chat de voz** (botão **Voz** no topo, ou tecla **V**): o navegador pede o
    microfone e você passa a ouvir e falar com quem está na voz. No topo ficam as
    carinhas de quem está na voz (acende verde em quem está falando) e, com você na
    voz, os botões de **microfone** (tecla **V**), **ensurdecer** (para de ouvir a voz
    e desliga o microfone) e **sair da voz**. Na lista de pessoas, quem está na voz
    ganha o ícone do microfone (vermelho se estiver mudo); com você na voz, clicar
    nesse ícone abre ali mesmo o **volume da voz daquela pessoa** (só pra você; fica
    guardado neste navegador). Se a sua conexão cair (ou o app for atualizado), você
    volta pra voz sozinho, do jeito que estava. Sem microfone, dá pra entrar só pra
    ouvir. O áudio vai direto entre as pessoas (pelo TURN do servidor quando precisa),
    com cancelamento de eco e de ruído do navegador. Quem transmite a tela com o áudio
    do sistema e está na voz: o app pede pro navegador deixar de fora da captura o som
    desta página (a voz dos outros e as outras transmissões), mas nem todo navegador
    atende; se alguém ouvir o próprio eco, quem transmite deve usar fone de ouvido.
12. **Atalhos** (lista completa no rodapé da lista de pessoas, ou tecla **?**): valem
    pro quadro debaixo do mouse (ou o em tela cheia, o fixado ou o único na tela):
    **M** som, **F** tela cheia, **P** fixar, **S** print, **1** a **6** reações,
    **C** chat, **V** voz/microfone.
13. **Perfil** (clique na sua fotinha, no rodapé da lista, ou em **Perfil**): escolha
    a sua **cor** (umas prontas, a barrinha pra qualquer outra, ou **Automática**, a do
    nick) e uma **foto** (PNG, JPG, WebP ou GIF animado até 5 MB; as fotos paradas
    viram um quadradinho de 256 px). A cor e a foto aparecem pra todo mundo na lista,
    no chat, nos quadros, nos rabiscos e no mouse, e ficam salvas no navegador como o
    nick: na próxima vez elas já entram junto. As fotos ficam só na memória do servidor
    enquanto a pessoa está na sala.

## App de desktop (Windows)

Além do navegador, dá pra usar o app de desktop. Ele abre a mesma sala do seu
servidor (então tudo que muda no servidor chega nele sem reinstalar) e acrescenta o
que o navegador não faz:

- **Marcações na sua tela de verdade**: transmitindo a tela inteira pelo app, quando
  alguém aponta (Alt + clique), desenha (Alt + arrastar) ou reage na sua transmissão,
  aparece também no seu monitor, por cima de tudo (até de jogo em tela cheia "sem
  bordas"; em tela cheia exclusiva o Windows não deixa nada por cima). Essa camada não
  pega cliques e fica de fora da captura, então quem assiste não vê nada duplicado. O
  seu quadro na sala ganha a etiqueta **na sua tela** enquanto isso está ligado.
  Compartilhando só uma janela, as marcações aparecem só pra quem assiste.
- **Também transmitindo pelo OBS**: com o app aberto na sala com o mesmo nick do OBS,
  quando a sua transmissão do OBS entra no ar o app abre essa camada sozinho, no
  monitor principal. (A sua própria transmissão do OBS não abre sozinha na sala, pra
  não gastar internet à toa; pra ver como ela está chegando, clique em **Assistir** ao
  lado do seu nome, e o quadro "Você" mostra a etiqueta **na sua tela**.)
  Pra escolher o monitor que o OBS está capturando, ou desligar, use o botão **OBS** da
  sala: a janela dele ganha a opção **Marcações na sua tela**, e o app lembra a escolha.
  As marcações caem no lugar certo quando a cena do OBS é a captura do monitor ocupando
  a tela toda (o normal); com a cena recortada ou montada, elas ficam na proporção da
  cena.
- **Modo desenho (Ctrl+Shift+D)**: transmitindo pelo app (tela inteira) ou pelo OBS,
  o atalho funciona com qualquer programa ou jogo na frente e liga o modo desenho na
  sua tela: a camada passa a pegar o mouse e você rabisca direto no seu monitor, e quem
  assiste vê o traço chegando ao vivo na sua transmissão (e você no seu quadro da
  sala). Sem limite de tamanho do traço nem de ritmo, porque é você rabiscando a sua
  própria transmissão. Os rabiscos ficam na tela enquanto o modo estiver ligado; uma
  barrinha no topo mostra que ele está ligado e tem as cores (a sua, vermelho, amarelo,
  verde, branco), **Desfazer** (**Ctrl+Z**), **Limpar** (**Del**) e **Sair** (**Esc** ou
  **Ctrl+Shift+D** de novo); saindo, os rabiscos somem pra todo mundo. A camada não
  rouba o foco: o jogo continua na frente quando você sai do modo.
- **Mouse de quem assiste**: transmitindo pelo app (ou pelo OBS, com as marcações na
  tela ligadas), quando alguém passa o mouse por cima da sua transmissão, aparece na
  sua tela uma setinha na cor da pessoa, com a foto de perfil dela (ou a letrinha do
  nick), sem nome; cada pessoa com uma cor diferente. Quem assiste também vê, em cima
  do quadro, o mouse de quem está assistindo junto (no app e no navegador), e o próprio
  mouse em cima da transmissão vira essa mesma setinha: todo mundo vê a mesma coisa. O botão da setinha, embaixo da lista
  de pessoas, abre o painel **Mouse e controle**: ali quem assiste desliga o próprio
  mouse, e quem transmite desliga o de todo mundo.
- **Controle remoto** (desligado por padrão): enquanto você transmite, cada pessoa da
  lista da sala ganha um botão 🎮; clique nele e confirme em **Permitir?** (uma pessoa
  por vez; dá também pelo painel **Mouse e controle**). A pessoa ganha o botão 🎮 em
  cima da sua transmissão, e o 🎮 dela na sua lista fica aceso (clicar nele tira o
  controle). Com ele ligado, o mouse dela mexe no seu mouse de verdade
  (clique, botão direito, rodinha) e, com o mouse dela em cima da transmissão, o
  teclado dela digita no seu PC, pela posição das teclas (com o mesmo layout dos dois
  lados, ex.: ABNT2, sai igualzinho). Enquanto isso, um aviso fica na sua tela, e
  **Ctrl+Shift+X** (de qualquer programa) tira o controle na hora; ele também acaba
  sozinho quando você para de transmitir ou a pessoa sai. **Você tem prioridade**:
  mexeu no seu mouse, o controle da pessoa pausa até você parar (1,5 s depois do seu
  último movimento), e o aviso fica verde ("Você está no mouse"). No Windows, o app lê o
  Ctrl+Shift+X direto do teclado, então ele funciona mesmo se outro programa usar o
  mesmo atalho. Todos os atalhos chegam, inclusive os da tecla do Windows: quem controla
  pelo app (no Windows), com o mouse em cima da sua transmissão e o app na frente, manda
  todas as teclas pra cá (Win, Alt+Tab, Alt+F4, Ctrl+Esc, Print Screen...), sem que elas
  ajam no PC dela; tirando o mouse de cima ou indo pra outra janela, o teclado volta a ser
  dela. No navegador, isso só funciona com a transmissão em tela cheia. Ctrl+Alt+Del e
  Win+L o Windows não deixa nenhum programa pegar. Só funciona transmitindo a tela
  inteira (ou o OBS capturando um monitor) e não mexe em janelas abertas como
  administrador (o Windows não deixa). Quem controla pode esconder tudo que fica por
  cima da transmissão (os botões, o aviso e, em tela cheia, a barra e o chat), pra
  clicar em qualquer canto da tela de lá: o botão do olho riscado, em cima do quadro, ou
  **Ctrl+Shift+H** (esse atalho fica com quem controla, não vai pra lá). Pra mostrar de
  novo: **Ctrl+Shift+H** ou o botão do olho na barra de baixo do quadro; parar de
  controlar também mostra.
- **Seletor próprio de tela/janela**, com miniaturas atualizando, e a opção
  **Compartilhar o som do PC** (o som do Windows inteiro, inclusive compartilhando a
  tela toda). Quem estiver na voz: use fone, senão quem assiste ouve o próprio eco.
- A transmissão e a voz continuam firmes com o app minimizado, e a barra de tarefas
  pisca quando chega mensagem no chat com o app em segundo plano.
- **Aviso de versão nova**: o app procura atualização ao abrir e a cada 6 horas. Na
  versão instalada (Setup), o aviso no topo da sala tem o botão **Atualizar**: ele
  baixa a versão nova (com o progresso no aviso e na barra de tarefas), instala e abre
  o app de novo sozinho. Na versão portátil, o aviso traz o link pra baixar a nova.
  **Depois** esconde o aviso até o app abrir de novo (fica o link **Atualizar o app**
  no rodapé da lista). Pra procurar na hora, sem reabrir o app: **Verificar atualização**,
  no rodapé da lista (ele também avisa se o servidor já tem versão nova e a página
  precisa ser recarregada). A 1.4.0 é a primeira com isso: de uma versão anterior, baixe a
  nova na mão uma última vez.

Instalação: baixe o `Web-Screen-Share-Setup-<versão>.exe` (ou o `Portable`, que roda
sem instalar) na [página de Releases](https://github.com/UsuarioDeJava/web-screen-share/releases/latest)
(o link **Baixar o app** no rodapé da lista de pessoas leva até lá). O app não é
assinado: se aparecer "O Windows protegeu o computador", clique em **Mais informações**
→ **Executar assim mesmo**. Na primeira vez ele pede o endereço do servidor (o mesmo do
navegador, ex.: `https://nome-do-nas.tailXXXX.ts.net:3100`); pra trocar depois, use
**Trocar servidor** no rodapé da lista de pessoas. Com o certificado autoassinado da
imagem Docker, o app pergunta uma vez se pode confiar no servidor.

Atalhos do app: **Ctrl+Shift+D** modo desenho e **Ctrl+Shift+X** tirar o controle
(os dois valem com qualquer programa na frente), **F11** tela cheia, **Ctrl+R**/**F5**
recarregar, **Ctrl + +/−/0** zoom, **F12** ferramentas de desenvolvedor.

Também sai uma versão pra Linux (`.AppImage`, que se atualiza pelo botão como a
instalada), sem o som do PC, sem as marcações, o
mouse de quem assiste e o controle remoto na tela (lá não dá pra tirar a camada da
captura). O código do app fica na pasta
`desktop/`, e o GitHub Actions gera os instaladores a cada mudança nela
(`.github/workflows/desktop.yml`). Pra rodar a partir do código: `cd desktop && npm
install && npm start`.

## Observações

- `getDisplayMedia` exige um "contexto seguro": HTTPS, ou `localhost`. Sem HTTPS
  (`start.sh`/`start.bat` sem Tailscale), só quem está no próprio PC do servidor
  consegue transmitir; os outros só assistem. Com HTTPS (certificado do Tailscale, ou
  a imagem Docker, que sempre sobe em HTTPS) qualquer um transmite.
- Celulares geralmente não conseguem compartilhar a tela pelo navegador (o botão
  some e aparece um aviso), mas assistem normalmente.
- Captura de áudio do sistema junto com a tela depende do navegador/SO (no Windows,
  o Chrome geralmente permite ao compartilhar a tela inteira; no Linux o suporte é
  mais limitado; Firefox e derivados, como o Zen, não capturam). Se não for possível,
  a transmissão segue apenas com vídeo; pra ter áudio nesses casos, transmita pelo OBS.
- Para acesso fora da rede local, use [Tailscale](https://tailscale.com/) (ou outra
  VPN) e acesse pelo IP dela — não é necessário abrir portas no roteador.
- Cada pessoa que transmite envia uma cópia do vídeo pra cada pessoa que está
  assistindo (não há servidor de mídia no meio). Pra um grupo pequeno de amigos isso
  é tranquilo; se a internet de quem transmite for fraca, quem assiste pode baixar a
  qualidade ou parar de assistir as telas que não interessam.
- Se um quadro ficar preso em "Conectando…" ou alternando com "A conexão falhou.
  Tentando de novo…", a conexão direta (P2P) não está conseguindo se estabelecer
  entre aquelas duas pessoas — normalmente firewall/antivírus bloqueando UDP ou NAT
  restritivo. O app tenta o TURN (veja acima) e reconecta sozinho; o botão **(i)** do
  quadro mostra se a conexão está saindo direta ou via TURN. Na imagem Docker o TURN é
  o embutido; fora dela, o público padrão tem banda limitada e é de terceiros, então
  pra uso frequente (ou privacidade) vale configurar um TURN próprio.
