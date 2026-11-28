# web-screen-share

Gamepad e permissões individuais de teclado/mouse/controle: veja [GAMEPAD.md](GAMEPAD.md)
para configurar o aplicativo e os componentes de controle virtual no Windows.

O retorno de vibração do controle virtual pode chegar ao controle de quem está
jogando, por WebRTC ou pelo fallback do servidor. Exige versões compatíveis nos
dois lados e um controle com vibração compatível com o navegador. O retorno só
funciona enquanto o participante está controlando com a janela em foco; parar de
controlar ou revogar a permissão interrompe os efeitos. A validação atual usa
atuador simulado no receptor; jogos e controles físicos remotos ainda precisam
ser testados.

Uma sala de compartilhamento de tela pelo navegador, tipo um mini Discord só pra
transmissão (sem voz nem câmera): cada pessoa entra com um nick, pode compartilhar a
própria tela e assistir as telas dos outros, tudo na mesma página. Funciona na rede
local ou via Tailscale, sem instalar nada além do Node.js (ou via Docker).

## Como funciona

- Um servidor Node.js (Express + Socket.io) serve a interface web e faz a sinalização
  WebRTC. Ele escuta em `0.0.0.0`, então fica acessível por qualquer IP da máquina
  (rede local, Tailscale, etc).
- Todo mundo abre a mesma página (`/`), escolhe um nick e entra na sala.
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

Fotos e imagens de cursor/ping usam upload HTTP binário em versões compatíveis,
separado do Socket.IO de sinalização e fallback de comandos. Se usar proxy reverso,
permita POST em `/asset-upload`, corpo de até 5 MiB para fotos (2 MiB para imagens
de estilo) e tempo de upload de até 60 segundos. O app mantém o transporte antigo
quando o servidor não anuncia suporte; falhas HTTP não reenviam a imagem pelo socket.

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

As credenciais do TURN embutido valem **uma hora** por padrão. A variável
Para testar a escolha coletiva de relay, configure dois a oito hostnames TURN
distintos (TURN local e/ou `TURN_URLS`) e ative no app **Configurações → Experimental →
Escolher relay pela latência dos participantes** em todos os participantes. Reinicie
para aplicar. O servidor escolhe o menor pior RTT medido pelo grupo para novas
conexões, preservando STUN/direto e conexões em andamento. Sem medições recentes de
todos, mantém a seleção normal. A opção vem desligada; RTT de eco não mede atraso
da imagem. Outros computadores/redes precisam de comparação pelo usuário.

`TURN_CREDENTIAL_TTL_SECONDS` aceita de 60 a 86400 segundos; valor inválido impede
o servidor de iniciar. O app atualiza o cache ICE em até cinco minutos, antes de
abrir novas conexões, preservando as que já estão funcionando. Credenciais de
um TURN externo configuradas por usuário/senha continuam sob gestão desse serviço.
Depois de atualizar o servidor, reabra a sala nos clientes que ainda carregavam
o JavaScript antigo, cujo cache só era atualizado ao abrir a página.

Consultas ICE e publicação OBS compartilham um limite de emissão: por padrão,
120 por endereço e 1200 globais por minuto, com rajada inicial desses tamanhos e
reposição contínua. `TURN_ISSUE_PER_MINUTE` e `TURN_ISSUE_GLOBAL_PER_MINUTE` aceitam
inteiros de 1 a 60000. Endereços atrás do mesmo NAT/proxy compartilham a cota;
ajuste os valores se necessário. O app informa quando o limite é atingido e
respeita o prazo de nova tentativa. Com autenticação, há também uma cota por sessão
validada, que acompanha o cookie mesmo se o endereço mudar. A publicação OBS com
Bearer válido usa uma cota compartilhada dessa credencial, sem depender de cookie.
`TURN_ISSUE_IDENTITY_PER_MINUTE` aceita de 1 a 60000 e, quando ausente, herda
`TURN_ISSUE_PER_MINUTE` (120 por padrão). Não identifica pessoas: abas do mesmo
cookie e publicadores com o mesmo token compartilham a respectiva cota. Novos
logins têm outra sessão, mas os limites de endereço/global e de login continuam.
Esse limite não atua nos pacotes de vídeo ou
comandos de uma conexão já estabelecida.

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

**Pelo app de desktop**, entre na sala e abra **Engrenagem → Conexão e testes → Transmitir pelo OBS Studio**. No OBS, selecione o serviço **WHIP**, copie o endereço local e o Bearer Token exibidos pelo app e use vídeo AV1 ou H.264 e áudio Opus. O vídeo precisa ser de 8 bits (em **Avançado**, Formato de cor **NV12**): AV1 de 10 bits (P010 ou HDR, comum na NVENC) chega, mas nenhum navegador mostra; o app avisa quando isso acontece. Se o app avisar que está perdendo parte do vídeo até o servidor, a conexão tem menos banda que o bitrate do OBS (comum no Tailscale sem conexão direta, via DERP): baixe o bitrate. O app recebe a cena e o áudio mixado no próprio PC e encaminha os pacotes codificados para a publicação da sala. Mantenha o app aberto durante a transmissão.

Quando você libera o gamepad nessa transmissão, o WSS tenta ligar o player do jogador diretamente ao seu PC. A troca ocorre após o primeiro quadro decodificado e a chegada do áudio, quando presente. O volume e o estado de mudo são preservados. Se a conexão cair ou você revogar o gamepad, o player reabre a transmissão do servidor. Os demais espectadores continuam pelo servidor. O intervalo de quadro-chave de 1 segundo no OBS ajuda quem entra no meio da transmissão.

**Pelo navegador**, publique no endereço do servidor. No OBS, em **Configurações > Transmissão**:

- **Serviço:** `WHIP`
- **Servidor** e **Bearer Token:** entre na sala e clique em **OBS** no topo (abre
  **Configurações > Conexão e testes**), que mostra os dois prontos pra copiar:
  - um endereço e um token individuais, gerados pro seu
    participante. O token é obrigatório nesse endereço, vale por até 8 horas e é
    encerrado quando você sai da sala;

O identificador público da transmissão e o token privado são independentes. O nome
não prova propriedade: apenas o participante vinculado à credencial pode usar as
marcações locais e conceder comandos sobre aquela transmissão. Outros participantes
não recebem o token na lista da sala, nas URLs ou no relatório de métricas.

A credencial vale por até oito horas e é revogada ao sair da sala. Uma queda de transporte permite retomar por até dois minutos
com o mesmo segredo. A aba usa sessionStorage para conservar
esse segredo ao recarregar; **Sair** remove a cópia local. Após expiração, fechamento
sem retomada ou reinício do servidor, copie a nova configuração e atualize o OBS.
Isso revoga o vínculo/comandos e a autorização de sinalização; não promete encerrar
instantaneamente uma sessão RTP já estabelecida no MediaMTX.

O endereço legado `/obs/SEU-NICK` continua disponível como publicação sem vínculo
com um PC: não habilita comandos nem marcações locais por coincidência de nick. Com as
contas ligadas (`ACCOUNTS=on`), esse endereço só aceita a chave do OBS da conta como
Bearer Token (e o `OBS_PUBLISH_TOKEN` fica sem uso); a transmissão aparece com o nick
da conta, ligada a ela. Com contas, quem assiste uma transmissão do OBS precisa estar
logado.
Para proteger essa publicação legada, configure `OBS_PUBLISH_TOKEN` no ambiente com
32 a 256 caracteres ASCII sem espaços. Prefira um segredo aleatório; por exemplo,
gere 32 bytes em hexadecimal com
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Use HTTPS e informe o segredo somente no campo Bearer Token, nunca na URL.
A proteção cobre iniciar, atualizar e encerrar a sessão WHIP. A VPN controla quem alcança a sala.

O coturn embutido também limita alocações simultâneas: `TURN_TOTAL_QUOTA` tem padrão
128 e `TURN_USER_QUOTA`, 16 por credencial, limitado ao total. Uma conexão pode
consumir mais de uma alocação; esses números não representam jogadores. O limite
por credencial não impede obter outra credencial pelo endpoint da sala.
`TURN_MAX_BPS` e `TURN_BPS_CAPACITY` permitem configurar banda por sessão e capacidade
do servidor, respectivamente, em **bytes por segundo**; ambos ficam desativados
por padrão (`0`). Ajuste-os após medir o tráfego para evitar prejudicar o vídeo.
Essas opções afetam novas execuções da imagem compilada deste checkout; não foram
aplicadas ao servidor em uso. A aplicação das quotas pelo coturn real ainda precisa
ser validada.

Depois é só **Iniciar transmissão**. Com a credencial individual vinculada à sala, a
transmissão aparece na sua própria linha da lista (com a etiqueta OBS), sem criar outra
pessoa. O botão **OBS** no topo da sala abre **Configurações > Conexão e testes**, com
esse endereço e o token prontos pra copiar, e testa se a porta UDP está liberada. Em
**Configurações > Saída**, um codificador AV1 ou H.264, uns 6000 Kbps e intervalo de
quadro-chave de 1 s funcionam bem (o intervalo curto faz quem entra no meio começar a
ver mais rápido).

Duas coisas precisam estar certas no servidor:

- **Certificado de verdade.** O OBS não aceita o certificado autoassinado; use o do
  Tailscale (veja [Certificado do Tailscale no container](#certificado-do-tailscale-no-container))
  e o endereço com o nome dele (`https://nas.seu-tailnet.ts.net:3000/obs-publish/...`).
- **Porta 3000/UDP publicada** apontando pra porta 3478/UDP do container. O OBS manda o
  vídeo pelo TURN embutido, e ele só sabe usar TURN por UDP. O `docker-compose.yml` e a
  loja já publicam essa porta em instalações novas. **Se o app já estava instalado**
  (o "Verificar e atualizar" do CasaOS troca a imagem, mas não mexe nas portas): no
  CasaOS, abra as **Configurações** do app, em **Portas** clique em **+ Adicionar**,
  preencha **Host** `3000`, **Container** `3478`, **Protocolo** `UDP` e salve. Se o site
  usa outra porta no host, use esse mesmo número na porta UDP.

Quem assiste precisa de suporte WebRTC ao codec selecionado no OBS. Para AV1 via WHIP, use o OBS Studio 30.1 ou superior. A rota pelo servidor e a rota direta entregam o mesmo codec ao espectador.

Por dentro: o servidor repassa a transmissão pra um [MediaMTX](https://github.com/bluenviron/mediamtx)
embutido no container, e quem assiste puxa o vídeo dele (WHEP), pelo mesmo TURN. Ou
seja, diferente do compartilhamento pelo navegador, o OBS envia uma cópia só, pro
servidor, e o NAS manda uma cópia pra cada pessoa assistindo.

## Painel de administração

O painel fica em `https://<endereço-do-servidor>:3000/admin`. Use HTTPS para acessar o
painel. Para desenvolvimento HTTP local, defina `ROOM_COOKIE_SECURE=0`.

**Sem contas (o padrão)**, os participantes entram em `/` só com um nick. Defina
`ADMIN_PASSWORD` no ambiente do servidor (no Compose, use o arquivo `.env`) e recrie o
container. Abra o `/admin` no navegador e informe a senha. A sessão dura oito horas ou
até clicar em **Sair**. Para trocar a senha, altere a variável e recrie o container. Sem
a variável, o painel fica desabilitado.

O painel permite configurar a sala, ver e desconectar participantes e limpar o chat. As
configurações ficam em `settings.json` na pasta de dados. As variáveis `ROOM_ACCESS_KEY`
e `ROOM_ACCOUNT_KEYS` deixam de controlar a entrada.

### Câmera do celular (WSS Câmera)

O app Android **WSS Câmera** (`WSS-Camera-<versão>.apk`, nos releases do app de desktop)
transmite a câmera do celular pra sala, entrando como o OBS: precisa do OBS ligado no
servidor e do app de desktop aberto na sala, com o celular na mesma rede do PC.

No PC, abra **Configurações > Conexão e testes > Conectar câmera**. No celular, leia o QR
ou digite o IP mostrado; pelo IP, o PC pergunta se pode conectar. As câmeras pareadas
ficam na lista, com **Remover** (a câmera removida volta pro pareamento).

O app do PC recebe a câmera na porta TCP 38219 e o vídeo pelas UDP 38220–38230. Essa
porta só abre com o app na sala e com uma câmera pareada ou o QR aberto. Na primeira vez,
o Windows pergunta se o app pode usar a rede: permita em **Redes privadas**. Uma
transmissão por vez: com o OBS no ar, a câmera espera (e vice-versa).

### Contas (opcional)

Pra ligar as contas (só entra quem tem conta, e quem cria as contas é o dono do
servidor), adicione no container a variável **`ACCOUNTS=on`** (no CasaOS: nas
configurações do app, em variáveis de ambiente; no `docker-compose.yml`, descomente a
linha `ACCOUNTS=on`). Com contas, o `/admin` abre com o nick e a senha de uma conta com
administração, e o `ADMIN_PASSWORD` fica sem uso.

1. **A conta Admin.** Na primeira vez que o servidor sobe com `ACCOUNTS=on`, ele cria a
   conta **Admin** com uma senha aleatória e mostra no log: no CasaOS, nos **Logs** do app; no Docker, `docker logs web-screen-share`.
   Procure a linha `Conta de administração criada: nick "Admin", senha: ...`. Ela só
   aparece essa vez. Esqueceu? Suba o container com a variável
   `ADMIN_RESET_PASSWORD=1`: uma senha nova aparece no log (depois tire a variável).
2. **Entre com o Admin** no `/admin` (ou na página da sala, que leva pro `/admin`), com
   o nick `Admin` e a senha do log. No primeiro acesso ela pede uma senha sua. A conta
   Admin não entra na sala (não aparece na lista, não transmite nem assiste).
3. **No painel**, em **Contas**, crie a conta de cada pessoa: o nick e uma senha
   provisória (o botão **Gerar** sugere uma fácil de digitar). Passe a senha pra
   pessoa: no primeiro acesso ela troca por uma dela. Marque **Conta com
   administração** pra quem também pode abrir o painel. Não dá pra repetir nick (nem
   com maiúsculas diferentes).

Quem tem administração abre o painel pelo botão do escudo, ao lado do seu nome na
sala: no navegador, o `/admin` abre numa aba nova e já entra com a sua conta; no app,
abre no navegador do sistema, que pede o nick e a senha.

Com contas, o painel tem ainda:

- **Contas**: renomear, dar uma senha provisória nova (quem estava conectado com ela
  sai), dar ou tirar a administração e apagar a conta (a pessoa sai na hora). Só o
  dono (a conta Admin) marca administração e mexe nessas contas; as outras contas com administração criam e cuidam só das contas
  normais (e renomeiam a própria), pra ninguém sair criando administradores.
- **Sala**: além do resto, quem pode transmitir (todo mundo ou só contas com
  administração). Vale pra sala, pro app e pro OBS.
- **Minha conta**: trocar a sua senha.

Cada pessoa troca o próprio **nick** e a **senha** em **Configurações > Perfil**, no
cartão **Conta**. Nick que já existe não salva: aparece o aviso em
vermelho. A sessão fica lembrada no navegador/app: da próxima vez entra direto, até
clicar em **Sair**.

As contas ficam em `accounts.json`, na pasta de dados (as senhas só como hash).
Tirando a variável `ACCOUNTS` (ou deixando vazia), a sala volta a ser só com nick; as
contas continuam guardadas pra quando ligar de novo.

### Diagnósticos no painel

Em **Servidor e contêiner**, o painel registra uma amostra a cada cinco segundos e mostra os últimos dez minutos, inclusive CPU e memória do processo WSS. No Docker Linux, apresenta também uso e limites informados pelos cgroups e tráfego das interfaces do contêiner.

Em **Configurações → Log em tempo real → Relatar problema**, no app ou no navegador, o participante pode descrever uma falha, conferir os campos e enviar um único relato. A opção de análise automática começa desligada e fica salva por servidor neste navegador ou perfil do app. Na primeira vez que a pessoa entra na sala de um servidor com o painel ligado, uma tela grande pergunta se ela quer compartilhar, mostrando o que é e o que não é enviado: **Compartilhar dados** liga, **Agora não** guarda a escolha e Esc fecha sem decidir (a sala pergunta de novo na próxima vez). Sem o painel ligado, ninguém vê esses dados, e a sala não pergunta. Quando ativada, envia métricas das conexões a cada dez segundos (com o codificador e o decodificador usados), configurações de vídeo, o sistema, o navegador e as versões, e as falhas detectadas com a mensagem do erro e onde ele aconteceu (os endereços vão cortados, só com o nome do arquivo). Além dos erros de código, de captura e de interface travada, a tela preta vira falha: conectado há 15 segundos sem nenhum quadro, tanto em quem assiste quanto em quem transmite. Desligá-la remove as métricas ao vivo e cancela os próximos envios. Relatos já recebidos seguem o prazo do servidor.

O administrador vê as conexões em **Transmissões** e consulta **Erros agrupados** por tipo, cliente e versão. Cada ocorrência traz as configurações e até um minuto de amostras disponíveis. O WSS guarda até 500 relatos em `diagnostics.json` na pasta de dados, por sete dias por padrão. O painel permite escolher 1, 7 ou 30 dias ou apagar o histórico. Descrições manuais incluem o texto digitado pelo participante.

## Uso

### Captura direta para jogos

No topo da sala, **Transmissão** abre os perfis **Tela e texto · 30 FPS**,
**Jogo · até 1080p60** e **Jogo · até 720p60**. Escolha o perfil antes de compartilhar.
Os limites preservam a proporção da fonte; o FPS e a resolução efetivos dependem
da fonte, dos PCs e da conexão. O OBS continua usando as próprias configurações.

O modo automático prefere H.264 quando negociável e mantém outros codecs como
fallback. A preferência pode ser alterada antes de transmitir. O painel informa o
encoder realmente usado quando o navegador o expõe; uma estimativa de capacidade
ou a aceleração gráfica habilitada não comprovam hardware em uso.

Durante a transmissão, é possível priorizar **Fluidez** ou **Nitidez do texto**,
desativar a prévia local e configurar um **limite total de upload**. Com limite
maior que zero, o teto de vídeo usa 80% do valor, dividido entre os espectadores;
a margem restante ajuda áudio, comandos e overhead. Isso não mede nem garante a
velocidade física da conexão. Zero deixa sem teto adicional do app.

O botão **(i)** de cada vídeo mostra decoder, tempo de decodificação e jitter buffer,
quando disponíveis. RTT da rede, filas e tempo de processamento são métricas
diferentes e não equivalem ao atraso completo entre apertar um botão e ver a imagem.

Em captura direta com perfil de jogo ou controle remoto ativo, a sala pode renovar
a conexão de mídia se detectar atraso persistente no buffer após a rede recuperar.
Isso pode interromper brevemente imagem e áudio; a captura e a conexão dos comandos
são preservadas. Há intervalo mínimo de 60 segundos entre tentativas. A validação
atual é local, com mídia sintética; o comportamento entre PCs ainda requer testes.

Se a fonte ficar temporariamente indisponível, a sala informa a pausa e acompanha
a retomada da mesma captura. Mudanças de tamanho recalculam os limites de envio,
inclusive com a prévia desligada. Quando a fonte encerra, compartilhe novamente
para escolher o que transmitir. Um monitor escolhido que desaparece não é
substituído automaticamente por outro para as marcações e o controle remoto.

### Conflitos de atalhos

Em **Configurações → Atalhos**, o app mostra quais atalhos globais estão ativos,
indisponíveis ou aguardando o contexto de desenho/controle. Se houver conflito,
libere a combinação no outro programa e use **Tentar registrar novamente**, sem
reiniciar o app. Os botões **Ativar/Encerrar desenho** e **Revogar controle remoto**
funcionam pelo painel; durante o desenho, a barra também mantém seus botões.
Uma tecla indisponível deixa de aparecer como dica na barra.

Ctrl+Shift+D só fica reservado enquanto há uma transmissão com marcações.
As teclas de desfazer, limpar e sair só são registradas enquanto você desenha;
o atalho de revogação, enquanto há controle remoto autorizado. No Windows, a
leitura local de Ctrl+Shift+X continua como alternativa de emergência.

### Desempenho visual

No aplicativo, **Configurações → Aplicativo → Desempenho visual** oferece os modos
**Completo**, **Econômico** e **Automático**. O econômico reduz partículas,
brilhos e desfoques na sala e nas marcações locais. O automático faz essa redução
quando detecta atrasos repetidos da interface e restaura os efeitos após um período
saudável. A escolha é salva e aplicada sem reiniciar. Vídeo, áudio, ponteiros e
comandos continuam ativos; esse detector não mede congestionamento de rede ou carga
da GPU. O padrão permanece Completo.

### Entrar, transmitir e assistir

1. Todo mundo abre o endereço do servidor (ex.: `https://<IP-ou-hostname>:3000/`),
   digita um nick e clica em **Entrar**. Se o nick já estiver em uso, o servidor
   acrescenta um número (ex.: `Ana (2)`). Com as contas ligadas (`ACCOUNTS=on`), entra
   com o nick e a senha da sua conta (veja [Contas (opcional)](#contas-opcional)).
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
     - **O seu mouse** (setinha): liga/desliga o seu mouse só naquela transmissão (fica
       salvo por pessoa que transmite). Ligado, ele só aparece depois que você **clica**
       na transmissão, como uma janela ativa do Windows: a borda acende na sua cor;
       clicou fora (outro quadro, o chat, a lista), trocou de programa ou escondeu a
       página, ela fica inativa e o seu mouse some de lá.
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
       aparece por cima do vídeo some na hora, inclusive a lista de pessoas. Em monitor
       com G-SYNC/FreeSync (taxa variável), a tela cheia continua desenhando na taxa
       máxima do monitor: sem isso, o monitor acompanhava o vídeo (uns 30 quadros por
       segundo) e o mouse inteiro ficava travando naquela tela.
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
   que deixa ela aberta até clicar fora ou apertar Esc. Pra deixar ela **fixa** do
   lado, clique no « no topo dela: o « vira um ×, a lista fica sempre aberta na coluna
   dela e as transmissões se ajeitam no resto (fica salvo); o × solta de novo. No
   celular ela fica numa faixa no topo. Se a conexão com o servidor cair, o aviso "Reconectando…"
   aparece também no topo.
7. **Sair** (ícone no rodapé da lista de pessoas) volta pra tela de nick. Do lado
   dele, o **sino** liga e desliga os sons da sala (alguém entrou ou saiu, começou a
   transmitir, mensagem nova no chat, alguém te marcou ou apontou na tela).
8. **Testar conexão** (no rodapé da lista de pessoas; abre **Configurações > Conexão e
   testes**, com o botão **Executar teste**): quando alguém não consegue
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
    desenhando, e fica enquanto você segurar o Alt (dá pra fazer vários traços
    seguidos); soltou o Alt, todos somem sozinhos uns segundos depois. No celular, cada
    traço some uns segundos depois de soltar o dedo. Vale pra todo mundo que
    está vendo a transmissão, inclusive quem transmite (que também pode marcar a
    própria tela, pra mostrar algo pra quem assiste). Com **Alt + Shift + arrastar**
    (ou apertando o Shift no meio do traço) o traço termina numa **flecha**, em
    qualquer pincel.
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
12. **Atalhos** (lista completa em **Configurações > Atalhos**: pelo link no rodapé da
    lista de pessoas ou a tecla **?**): valem
    pro quadro debaixo do mouse (ou o em tela cheia, o fixado ou o único na tela):
    **M** som, **F** tela cheia, **P** fixar, **S** print, **1** a **6** reações,
    **C** chat, **V** voz/microfone.
13. **Configurações** (a engrenagem ao lado do seu nome, a sua fotinha, o link **Perfil**
    ou **Ctrl+,**): são as **mesmas do app**, num popup por cima da sala (fecha no ×, no
    **Esc** ou clicando fora); no navegador só não aparecem as partes que existem só no
    app (Aplicativo, Log, servidor, marcações na tela e controle remoto).
    **Perfil**: escolha
    a sua **cor** e uma **foto** (PNG, JPG, WebP ou GIF animado até 5 MB; as fotos
    paradas viram um quadradinho de 256 px). A cor pode ser **Automática** (a do nick),
    uma das 20 prontas ou qualquer outra pelo lápis: quadrado de saturação e brilho,
    faixa do tom, código **HEX** ou **R G B**, **conta-gotas** (pega a cor de qualquer
    lugar da tela; Chrome, Edge e app), as cores **da sua foto** e as **recentes**. Numa
    cor escura, o nome clareia só o bastante pra dar pra ler no chat. A cor e a foto aparecem pra todo mundo na lista,
    no chat, nos quadros, nos rabiscos e no mouse, e ficam salvas no navegador como o
    nick: na próxima vez elas já entram junto. As fotos ficam só na memória do servidor
    enquanto a pessoa está na sala.
14. **Mouse e efeitos** (em **Configurações > Perfil**): deixe o seu
    mouse e as suas marcações do seu jeito, com uma **prévia ao vivo** pra testar do
    mesmo jeito que numa transmissão (mexer, clicar, rodinha, Alt + clique, Alt +
    arrastar, com Shift a flecha) e **pacotes prontos** (Neon,
    Fofura, Realeza, Retrô, Festa, Mago, Aventura, Pirata, Espacial, Natal, Anjinho,
    Diabinho, Assombrado, Gatinho, Alienígena):
    - **Setinha**: clássica, do PC, pixel, mãozinha, mira, lápis, espadinha, varinha,
      foguete, aviãozinho, patinha, fantasminha, coração ou estrela, em quatro
      **tamanhos**, com o **contorno** branco, preto ou colorido (a bolinha da foto
      também).
    - **Imagem própria**: a sua setinha pode ser uma imagem sua: **PNG**, **GIF**
      (animado também), **WebP** ou um cursor do Windows (**.cur** e **.ani**, com a
      ponta que vem no arquivo). Imagens grandes são reduzidas (até 128 px) e as
      animadas continuam animadas. Clique na imagem pra marcar onde fica a ponta.
    - **Efeito** na setinha (brilho, arco-íris, pulsando, pulinho, balançando,
      estrelinhas) e **rastro** (brilhinhos, arco-íris, corações, bolhas, fogo, neve,
      notas musicais, fumaça, pixels). A sua foto vai na bolinha do mouse pros outros;
      no seu próprio mouse ela não aparece, e o ping não leva nome (a cor e a foto já
      dizem quem é).
    - **Clique e rodinha**: mini mouse, ondinha, estrelinhas, corações, confete, raios,
      explosão, quadrinhos ("CLICK!") ou nenhuma.
    - **Ping** (Alt + clique): clássico, alvo, alerta, seta caindo, alfinete, bandeira,
      um **emoji** (👀 🎯 🔥 ⭐ 💥 ❤️ 😂 👉 🎉 💀 ❓ ✅ ❌ ⚠️ 💰 👻 😎 🤔 🚀 👏 🎁 🎄) ou uma
      **imagem sua** (PNG, JPG, WebP ou GIF), com o **som** que você escolher (ou sem
      som).
    - **Pincel** (Alt + arrastar): normal, neon, contorno, tracejado, pontilhado,
      marca-texto, arco-íris, purpurina ou rastro que some, em três **espessuras**.
      Com Shift junto, qualquer um deles vira flecha.

    Todo mundo vê do seu jeito: quem assiste junto, nos quadros, e quem transmite, na
    tela de verdade (pelo app 1.8 ou mais novo pras novidades). Fica salvo como a cor e
    a foto (as imagens próprias também, e vão de novo sozinhas quando você entra). No
    seu próprio mouse, a setinha é o cursor do sistema (sem atraso; a imagem própria
    animada troca de quadro também) e o resto vem junto logo atrás; o efeito animado na
    setinha (arco-íris, pulsando...) só os outros veem.

## App de desktop (Windows)

O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md) (e nas notas de cada
[release](https://github.com/UsuarioDeJava/web-screen-share/releases)).

Além do navegador, dá pra usar o app de desktop. Ele abre a mesma sala do seu
servidor (então tudo que muda no servidor chega nele sem reinstalar) e acrescenta o
que o navegador não faz:

- **Configurações** (a engrenagem ao lado do seu nome, clique no seu avatar/nome ou
  **Ctrl+,**): abre como um popup por cima da sala (não é uma janela a mais: fecha no
  ×, no **Esc** ou clicando fora), com **Perfil** (foto, cor, estilo do nick, moldura, mouse e efeitos), **Aplicativo** (ponteiro, sons, gamepad, desempenho, tela cheia e monitor das marcações do OBS), **Conexão e testes** (servidor e publicação OBS), **Experimental** (comandos e vídeo) e **Log em tempo real** (relatos, teste de conexão, ambiente e versões, registro de atividade, quem entrou e saiu,
  transmissões, conexões e erros, com busca, filtros e exportação em JSON; nada de
  conteúdo do chat ou da mídia) e **Atalhos**. A sala continua conectada enquanto
  você mexe; servidor, tela cheia e aceleração valem depois de **Salvar e reiniciar**.
- **Motor nativo experimental** (Configurações → Experimental): no app Windows x64,
  permite compartilhar uma janela em H.264/720p, com proporção preservada, um
  espectador e sem áudio do sistema. A opção fica desligada por padrão; salve
  antes de iniciar a transmissão. Requer app/servidor atualizados e navegador
  receptor compatível. Fechar ou redimensionar a janela encerra a captura.
  Reduções de bitrate são preservadas na recuperação, que mantém a captura e
  usa tentativas limitadas. Perdas ainda podem causar pausas e menor qualidade.
  Admissão, pacing, cópias de IPC e recuperação foram verificados localmente; detalhes e
  limitações estão em [DEVELOPMENT.md](DEVELOPMENT.md).
- **Vídeo experimental** (Configurações → Experimental): a adaptação de bitrate
  mais rápida pode ser ligada no PC que transmite pelo app, com a adaptação
  automática habilitada. Ela reduz o envio sob congestionamento grave mesmo sem
  estimativa de banda e recupera o bitrate gradualmente. Quem assiste pode solicitar um alvo de buffer de 50 ms
  para áudio/vídeo das transmissões, incluindo OBS. As duas opções vêm desligadas,
  são salvas por servidor neste PC e valem após **Reiniciar e aplicar**. Teste uma
  por vez e compare as métricas: o alvo não garante atraso de 50 ms e pode aumentar
  o buffer onde o automático já era menor. Em redes instáveis, pode haver cortes
  ou perda de qualidade. App e servidor precisam estar atualizados.
- **Limite de GPU experimental**: no transmissor, **Ajustar envio à carga medida da
  GPU** reduz resolução/FPS sob pressão sustentada do encoder ou da VRAM e recupera
  gradualmente. Exige adaptação automática e reinício para aplicar; vem desligado.
  Usa telemetria NVIDIA quando disponível ou evidência recente de sobrecarga do
  encoder por hardware. Dados ausentes não indicam capacidade livre. O diagnóstico
  mostra sessões do driver e VRAM globais, incluindo outros apps; não informa um
  máximo de sessões presumido. Não se aplica ao OBS ou motor nativo experimental.
- **Recuperação de vídeo experimental**: quem assiste pode ativar a renovação da
  mídia quando o atraso persiste após congestionamento. Vem desligada, aplica após
  reiniciar e pode pausar áudio/vídeo sem melhorar o atraso; comandos preservam seu
  transporte. Vale para perfis de jogo/controle, sem OBS. Compare ligado/desligado
  entre PCs e confira `latencyRecoveries` nas métricas. Com adaptação responsiva no
  transmissor, renovar a mídia preserva o limite reduzido de bitrate; subir a
  qualidade exige novas evidências de rede saudável.
- **Tela cheia "sem bordas"** (Configurações → Aplicativo, no Windows): em vez da tela
  cheia nativa, a janela cobre o monitor inteiro sem moldura (Esc/F11 voltam ao
  tamanho de antes). Pra quem sentir o vídeo ou o mouse engasgando na tela cheia
  nativa. Também tem o modo "vídeo ampliado dentro da janela". O padrão continua sendo
  a nativa.
- **Marcações na sua tela de verdade**: transmitindo a tela inteira pelo app, quando
  alguém aponta (Alt + clique), desenha (Alt + arrastar) ou reage na sua transmissão,
  aparece também no seu monitor, por cima de tudo (até de jogo em tela cheia "sem
  bordas"; em tela cheia exclusiva o Windows não deixa nada por cima). Essa camada não
  pega cliques e fica de fora da captura, então quem assiste não vê nada duplicado. O
  seu quadro na sala ganha a etiqueta **na sua tela** enquanto isso está ligado.
  Compartilhando só uma janela, as marcações aparecem só pra quem assiste.
- **Também transmitindo pelo OBS**: com o app aberto na sala e usando o endereço/token individuais gerados nela,
  quando a sua transmissão do OBS entra no ar o app abre essa camada sozinho, no
  monitor principal. (A sua própria transmissão do OBS não abre sozinha na sala, pra
  não gastar internet à toa; pra ver como ela está chegando, clique em **Assistir** ao
  lado do seu nome, e o quadro "Você" mostra a etiqueta **na sua tela**.)
  Pra escolher o monitor que o OBS está capturando, ou desligar, use **Monitor das
  marcações do OBS** em **Configurações > Aplicativo** (o botão **OBS** da sala abre
  ali), e o app lembra a escolha.
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
  tela ligadas), quando alguém clica na sua transmissão (deixando ela ativa) e passa o
  mouse por cima, aparece na
  sua tela uma setinha na cor da pessoa, com a foto de perfil dela (ou a letrinha do
  nick), sem nome; cada pessoa com uma cor diferente. Quem assiste também vê, em cima
  do quadro, o mouse de quem está assistindo junto (no app e no navegador), e o próprio
  mouse em cima da transmissão vira essa mesma setinha: todo mundo vê a mesma coisa. A
  sua setinha é o cursor do próprio sistema (uma imagem na sua cor), então não tem
  atraso nenhum; a bolinha com a foto (GIF animado também) vem logo atrás. Bem colado
  na borda direita ou de baixo da janela (uns 28 px), volta a setinha normal: o
  Chromium não deixa um cursor personalizado passar da borda.
  Clicar (botão esquerdo, direito ou a rodinha) ou rolar em cima da transmissão mostra
  uma animaçãozinha parada onde a pessoa clicou (não vai junto do mouse, e um clique
  novo não apaga o anterior): um mini mouse com a parte apertada acesa (e, rolando,
  uma setinha pra cima, pra baixo ou pros lados, com Shift + rodinha ou o touchpad), ou
  o estilo que ela escolheu. Quem assiste liga
  e desliga o próprio mouse em cada transmissão, no botão da setinha em cima dela; o
  botão embaixo da lista de pessoas abre **Configurações > Aplicativo**, onde quem
  transmite desliga o mouse de todo mundo.
- **Controle remoto** (desligado por padrão): enquanto você transmite, cada pessoa da
  lista da sala ganha um botão 🎮; clique nele e confirme em **Permitir?** (uma pessoa
  por vez; dá também por **Configurações > Aplicativo**). A pessoa ganha o botão 🎮 em
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
  inteira (pelo app, ou pelo OBS capturando um monitor, com o app aberto e as marcações
  ligadas) e não mexe em janelas abertas como administrador (o Windows não deixa).
  **Um mouse só** (transmitindo pelo app, no Windows): enquanto a pessoa está
  controlando (o 🎮 ligado em cima da transmissão), o mouse de quem transmite some da
  transmissão, e o mouse de quem controla, em cima dela, fica com o formato do de lá
  (seta, texto, mãozinha, setas de redimensionar...). Assim só aparece um mouse, sem o
  atraso do mouse de lá vindo no vídeo. Quem transmite continua vendo o mouse dele: o
  app desenha ele na camada das marcações (que não entra na transmissão); mexeu no
  mouse, o de verdade volta na hora. Pelo OBS, o mouse de quem controla também pega o
  formato do de lá; se o mouse aparece na transmissão é a captura do OBS que decide
  (a opção "Capturar cursor" da fonte). Quem controla pode esconder tudo que fica por
  cima da transmissão (os botões, o aviso e, em tela cheia, a barra e o chat), pra
  clicar em qualquer canto da tela de lá: o botão do olho riscado, em cima do quadro, ou
  **Ctrl+Shift+H** (esse atalho fica com quem controla, não vai pra lá). Pra mostrar de
  novo: **Ctrl+Shift+H** ou o botão do olho na barra de baixo do quadro; parar de
  controlar também mostra.
  Com app e servidor atualizados, a recepção dos comandos roda em um processo
  separado da janela da sala, inclusive quando usa o servidor como fallback.
  Assim, travar a interface da sala não interrompe essa recepção. Se o receptor
  falhar ou exceder sua fila, o app neutraliza e revoga a concessão afetada;
  para retomar, conceda o controle novamente. Servidores antigos continuam
  usando o caminho anterior, ligado à interface.
- **Seletor próprio de tela/janela**, com miniaturas atualizando, e a opção
  **Compartilhar o som do PC** (o som do Windows inteiro, inclusive compartilhando a
  tela toda). Quem estiver na voz: use fone, senão quem assiste ouve o próprio eco.
  Transmitindo uma **janela**, dá pra marcar **Só o som deste programa** (experimental,
  Windows 10 versão 2004 ou mais novo, e 11): em vez do som do PC inteiro, vai só o som
  do programa daquela janela (o programa inteiro: num navegador, todas as abas dele).
  Se o Windows não deixar, aparece um aviso e vai o som do PC, como sempre.
- A transmissão e a voz continuam firmes com o app minimizado, e a barra de tarefas
  pisca quando chega mensagem no chat com o app em segundo plano.
- Ao compartilhar uma janela no Windows, mantenha a janela capturada restaurada. No ensaio com quatro espectadores, minimizar a fonte reduziu a captura para 1 FPS; restaurá-la recuperou cerca de 60 FPS na mesma transmissão.
- **Aviso de versão nova**: o app procura atualização ao abrir, a cada 15 minutos e ao
  voltar pra ele. Na versão instalada (Setup), com **Atualizações automáticas** ligado
  (Configurações > Aplicativo, vem ligado), ele baixa sozinho e o aviso no topo da sala
  aparece já pronto: **Reiniciar** aplica na hora; se fechar o app, aplica ao fechar.
  Desligado, o aviso tem **Atualizar**, que baixa, instala e abre o app de novo. Na
  versão portátil, o aviso traz o link pra baixar a nova. **Depois** esconde o aviso até
  o app abrir de novo (fica o link no rodapé da lista). Pra procurar na hora:
  **Verificar atualização**, em Configurações > Aplicativo (ou no rodapé da lista). A
  1.4.0 é a primeira com isso: de uma versão anterior, baixe a nova na mão uma última vez.

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

- **Temas** (em preparação): a sala já aceita um CSS próprio por cima do visual
  padrão, com papel de parede, como os temas do Discord. Ainda sem tela pra escolher;
  veja [THEMES.md](THEMES.md) pra testar e pra lista do que dá pra mudar.
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
- Ainda travando em tela cheia num monitor com G-SYNC/FreeSync? Dá pra tirar o app da
  taxa variável: no Painel de Controle da NVIDIA, **Gerenciar as configurações 3D** →
  **Configurações do programa** → adicione o `Web Screen Share.exe` → **Tecnologia do
  monitor: Atualização fixa** (na AMD, no Adrenalin: **Jogos** → o app → FreeSync
  desligado).
- Ideias pro futuro: veja [IDEIAS.md](IDEIAS.md).
- Desenvolvimento do app (rodar do código, testes, opções de diagnóstico): veja
  [DEVELOPMENT.md](DEVELOPMENT.md).
- Para registrar uma partida, use **Configurações → Conexão e testes → Copiar métricas da
  sessão** no app ou no navegador. Copia JSON
  com FPS, codec, encoder/decoder quando informados, filas, rota e RTT dos comandos;
  sem nomes, endereços ou comandos pressionados. É uma fotografia das estatísticas
  locais, não uma medição do botão até a imagem. Não inicia transmissão ou testes
  de rede adicionais. Requer servidor atualizado com essa opção.
- **Configurações → Conexão → Testar conexão** também mostra as rotas de vídeo
  existentes e o transporte dos comandos, sem nomes ou endereços dos jogadores.
  A consulta dessas rotas é passiva; as sondas de conexão existentes continuam
  separadas. P2P WebRTC e indício de VPN não comprovam conexão direta do Tailscale
  nem ausência de DERP entre PCs.
