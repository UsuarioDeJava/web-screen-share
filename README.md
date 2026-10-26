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
e reinicie o app; o log avisa quando faltarem menos de 14 dias.

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
que atende na **mesma porta do site** (3000), então não precisa publicar porta nenhuma a
mais. O servidor separa as conexões TURN das do site pelo primeiro pacote. Esse TURN só
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

## Uso

1. Todo mundo abre o endereço do servidor (ex.: `https://<IP-ou-hostname>:3000/`),
   digita um nick e clica em **Entrar**. Se o nick já estiver em uso, o servidor
   acrescenta um número (ex.: `Ana (2)`).
2. Pra transmitir, clique em **Compartilhar tela** no topo e escolha a tela/janela no
   prompt do navegador. Seu quadro aparece com a etiqueta **AO VIVO** e um contador de
   quantas pessoas estão assistindo. Clique em **Parar transmissão** (ou no botão
   nativo do navegador) pra encerrar.
3. Quando alguém começa a transmitir, o quadro dessa pessoa aparece pra todo mundo e
   já começa a tocar. A lista lateral mostra quem está na sala e quem está ao vivo
   (clique num nome ao vivo pra ir até o quadro dele).
4. Em cada quadro, quem assiste controla só pra si mesmo, sem afetar os outros:
   - **Som e volume**: botão do alto-falante pra mutar/desmutar e barra de volume ao
     lado (no iPhone/iPad só o mute funciona, o iOS não deixa sites mudarem o volume).
   - Passando o mouse sobre o vídeo (no celular fica sempre visível):
     - **Qualidade** (Alta / Média / Baixa / Mínima): reduz resolução, quadros e taxa
       de bits que aquela pessoa te envia, útil com internet fraca.
     - **(i) Estatísticas**: estado da conexão, se ela é direta ou via TURN,
       resolução, fps, taxa e latência.
     - **Tela cheia** (ou dois cliques no vídeo).
     - **X — parar de assistir**: desliga aquela transmissão pra você (economiza
       banda); o quadro fica com um botão **Assistir** pra voltar.
5. **Sair** (ícone no canto inferior esquerdo) volta pra tela de nick.

## Observações

- `getDisplayMedia` exige um "contexto seguro": HTTPS, ou `localhost`. Sem HTTPS
  (`start.sh`/`start.bat` sem Tailscale), só quem está no próprio PC do servidor
  consegue transmitir; os outros só assistem. Com HTTPS (certificado do Tailscale, ou
  a imagem Docker, que sempre sobe em HTTPS) qualquer um transmite.
- Celulares geralmente não conseguem compartilhar a tela pelo navegador (o botão
  some e aparece um aviso), mas assistem normalmente.
- Captura de áudio do sistema junto com a tela depende do navegador/SO (no Windows,
  o Chrome geralmente permite ao compartilhar a tela inteira; no Linux o suporte é
  mais limitado). Se não for possível, a transmissão segue apenas com vídeo.
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
