# Novidades

Cada versão do app de desktop, da mais nova pra mais antiga. O que muda na sala (no
navegador e no app) chega com a atualização do servidor; o que é do app (seletor de
tela, marcações na tela de verdade, controle remoto, Configurações) chega com a versão
nova do app. As notas de cada release no GitHub vêm daqui.

## 2.1.1 — 2026-11-26

- **"Nenhum" no mapeamento do controle**: em **Configurações > Aplicativo > Meu
  gamepad**, cada botão e gatilho pode ficar como **Nenhum**: ele deixa de ser enviado
  pra quem transmite. No desenho do controle, o que está bloqueado aparece tracejado.
- **Botão Xbox/PS bloqueado**: o Guide vem como Nenhum, porque no PC de quem transmite
  ele abria a Game Bar ou a Steam. Pra liberar, escolha o botão em Guide. No seu próprio
  PC o app não consegue segurar esse botão (o Windows e a Steam leem o controle direto):
  o painel do controle explica onde desligar.
- **Controle Xbox sem fio reconhecido**: ele aparecia como PlayStation (com ✕ ○ □ △),
  porque o nome dele também tem "Wireless Controller", o mesmo do DualShock. Agora vem
  como Xbox.

## 2.1.0 — 2026-11-26

Junto com as novidades do **Paolinho**
([PR #6](https://github.com/UsuarioDeJava/web-screen-share/pull/6)). Atualize o
servidor e o app juntos.

- **OBS pelo app, com AV1**: no app, o OBS transmite pro próprio app (o endereço local
  e o token ficam em **Configurações > Conexão e testes**), e o app leva a cena e o som
  pra sala com a sua credencial: a transmissão aparece na sua linha, ligada a você. No
  OBS, use AV1 (OBS 30.1 ou mais novo) ou H.264, e áudio Opus. Deixe o app aberto
  enquanto transmite.
- **Gamepad direto pelo OBS**: liberando o gamepad numa transmissão do OBS, o jogador
  passa a ver direto do seu PC (menos atraso), e volta pelo servidor se a ligação cair.
  Sem a camada de marcações, o OBS ainda deixa liberar só o gamepad.
- **Configurações reorganizadas**: Mouse e efeitos foi pro **Perfil**, Ponteiro e
  controle pra **Aplicativo** e o OBS pra **Conexão e testes**. Aplicativo e Log também
  aparecem no navegador. Os botões de mouse, sons e os links do rodapé da sala saíram:
  tudo isso fica nas Configurações (a engrenagem).
- **Estilo do nick e moldura da foto**: em **Configurações > Perfil**, o nick pode ser
  itálico ou monoespaçado, e a foto ganha anel, anel duplo ou brilho, na cor do seu
  perfil.
- **Relatar problema**: em **Configurações > Log**, descreva o que aconteceu, confira
  os dados e envie pra quem administra o servidor. Na primeira vez que você entra na
  sala, uma tela pergunta se você quer ligar a **análise automática**, mostrando o que
  é e o que não é enviado (nunca a imagem, o som ou o chat). Ela começa desligada e
  pode ser desligada quando quiser.
- **Erros que chegam sozinhos** (com a análise ligada): erro no código, falha na
  captura, interface travada (no app também), a interface do app que caiu e a **tela
  preta**: conectado há 15 segundos sem nenhum quadro, tanto em quem assiste quanto em
  quem transmite (o caso do H.264 que ficava preto). Cada um vai com o detalhe que
  ajuda a achar a causa (a mensagem do erro, o motivo da falha, o codec e o codificador
  usados, o sistema e o navegador).
- **Teste guiado**: quem administra o servidor pode te convidar pra um teste de conexão
  de 10 segundos, com vídeo sintético. Você confirma cada vez.
- **O app fecha direito**: depois de transmitir pelo OBS pelo app, ele não fechava (o
  processo ficava aberto). Corrigido.
- **Chave de acesso da sala**: as variáveis `ROOM_ACCESS_KEY` e `ROOM_ACCOUNT_KEYS`
  deixaram de existir e não protegem mais a entrada. Se você usava, limite quem alcança
  o servidor pela VPN (ex.: Tailscale).

## 2.0.1 — 2026-11-25

- **Abas das Configurações numa linha só**: com a aba Experimental, elas quebravam em
  duas linhas (até em janela grande). Agora ficam sempre numa linha: "Log em tempo
  real" virou só **Log** e, em janela estreita, a fileira rola de lado (com a rodinha
  do mouse também), com a borda esmaecida do lado que ainda tem aba.
- **Copiar no app**: os botões de copiar das Configurações (o token e o endereço do OBS,
  o resultado do teste de conexão, as métricas) não faziam nada no app. Agora copiam.
- **OBS com contas ligado a você**: transmitindo pelo endereço `/obs/SEU-NICK` com a
  chave da conta, a transmissão aparecia como "OBS · sem vínculo". Agora ela é sua
  (na sua linha da lista, como as do app), inclusive se você entrar na sala depois de
  o OBS já estar no ar ou reconectar. Sem contas, use o endereço e o token que aparecem
  em Configurações > OBS e overlays **do mesmo app ou aba** que fica na sala: eles são
  daquele participante.

## 2.0.0 — 2026-11-25

Versão grande: as contas com painel de administração, o usuário de testes, o tema, as
Configurações iguais no navegador e no app e, junto, as 88 correções e melhorias de
transmissão, controle remoto, OBS, servidor e diagnóstico do **Paolinho**
([PR #5](https://github.com/UsuarioDeJava/web-screen-share/pull/5)), quase todas já
testadas no Windows dele. Atualize o servidor e o app juntos.

### Usuário de testes (com contas)
- O dono marca uma conta como **Usuário de testes** (ao criar ou na lista do painel).
  Pra quem usa, é uma conta normal: sem selo e sem aviso nenhum.
- Quem tem administração vê o selo **Teste** e um botão de controlar ao lado dela, na
  lista de pessoas. O botão abre um painel com o estado dela (app ou navegador,
  transmitindo, na voz) e os comandos, executados na sala dela como se ela clicasse:
  - **transmissão** (só com ela no app): a lista das telas e janelas só pelo nome, sem
    prévia; com o som do PC, sem som ou só o som do programa; começar e parar;
  - **controle remoto**: dar (teclado, mouse, gamepad) e tirar o controle de alguém;
  - **voz**: entrar e sair, ligar e desligar o microfone e o som.
- O servidor só aceita os comandos dessa lista, de quem tem administração, pra quem é de
  testes, e anota cada um no log. No app de quem é de testes, cada comando aparece no
  **Log** (categoria Usuário de testes). Uma conta de testes com administração não vê o
  próprio selo nem se controla.

### Contas (opcional, com a atualização do servidor)
- **Contas, se o dono quiser**: com a variável **`ACCOUNTS=on`** no container, só entra
  quem tem conta, criada pelo dono do servidor. Sem a variável (o padrão), nada muda:
  entra quem escolher um nick, como sempre. Na primeira vez que o servidor sobe com
  `ACCOUNTS=on`, ele cria a conta **Admin** com uma senha aleatória que aparece no log
  do container (no CasaOS, em Logs). O Admin entra na página da sala,
  cria a senha dele e cai direto no **painel de administração**: ele não entra na sala
  (não aparece na lista, não transmite nem assiste).
- **Painel de administração**: criar contas (nick e senha provisória, que a pessoa troca
  no primeiro acesso), marcar **Conta com administração** (ela também abre o painel,
  pelo botão do escudo) e **Usuário de testes**, renomear, dar senha nova, apagar; ver
  quem está na sala e
  desconectar; e as configurações da sala, que valem na hora: nome da sala, recado na
  tela de entrada, quem pode transmitir, controle remoto e OBS ligados ou não, limite
  de pessoas, quantas mensagens o chat guarda e apagar o histórico do chat.
- **Nick e senha no perfil** (aba Conta; no app, em Configurações > Perfil). Nick
  repetido não pode (nem com maiúsculas diferentes): aviso vermelho na hora de salvar.
- **Sessão lembrada**: da próxima vez entra direto, até clicar em Sair.
- **Só o dono marca administração e testes**: as outras contas com administração criam
  e cuidam só das contas normais (e renomeiam a própria), pra ninguém sair criando
  administradores.
- **OBS com a chave da conta**: com contas, o Bearer Token do OBS é a chave da sua
  conta, fixa (aparece em Configurações > OBS e overlays). Assim ninguém transmite com
  o nome de outra pessoa; assistir uma transmissão do OBS também exige estar logado.
- **Chave de acesso e contas juntas**: com `ROOM_ACCESS_KEY` (veja abaixo) e
  `ACCOUNTS=on`, a chave da sala vem antes do login com nick e senha.

### Controle remoto: um mouse só
- **Um mouse só**: controlando alguém, antes você via dois mouses na transmissão (o seu e
  o de lá, chegando atrasado no vídeo). Agora, enquanto você está no modo controle (o 🎮
  ligado em cima da transmissão), o mouse de quem transmite some da transmissão e o seu,
  em cima dela, fica com o formato do de lá: seta, texto, mãozinha, setas de
  redimensionar, ampulheta... Fica só um mouse, e o atraso some da vista. Quem é
  controlado continua vendo o mouse dele (o app desenha ele na camada das marcações, que
  não entra na transmissão) e, mexendo no mouse, o de verdade volta na hora. Vale pra
  transmissão pelo app, com quem transmite no app 2.0 no Windows. Pelo OBS, o seu mouse
  também pega o formato do de lá, e se o mouse de lá aparece é a captura do OBS que
  decide ("Capturar cursor").

### Mouse e efeitos
- **Saíram o "Enfeite" e o "Nome junto"**, e o **ping não mostra mais o nome** (em
  nenhum estilo): a cor e a foto no mouse já dizem quem é, e o nome atrapalhava.
- **A sua foto não aparece mais no seu próprio mouse** (vinha atrasada atrás da setinha);
  os outros continuam vendo.
- **A prévia funciona igual a uma transmissão**: clique e rodinha mostram a animação,
  **Alt + clique** dá o ping e **Alt + arrastar** desenha (com Shift, flecha); o traço
  fica enquanto o Alt estiver apertado. Antes ela desenhava só de arrastar, sem o Alt.
  Os títulos ficaram só "Ping" e "Pincel".
- **Flecha em qualquer pincel**: o pincel "Flecha" saiu; agora **Alt + Shift + arrastar**
  (ou apertar o Shift no meio do traço) termina o traço numa flecha, com o pincel que
  você usa (neon, tracejado, arco-íris, rastro que some...). No modo de desenho na
  tela (Ctrl+Shift+D), é Shift + arrastar. Quem tinha escolhido "Flecha" passa a usar o
  normal. No Windows, se você tem mais de um idioma de teclado, Alt + Shift também pode
  trocar o layout: dá pra desligar esse atalho nas configurações de idioma do Windows.
- Correção: escolher opções rápido na prévia deixava um traço de demonstração parado.

### App e sala
- **Só o som deste programa** (experimental, Windows 10 versão 2004 ou mais novo, e 11):
  transmitindo uma janela, o seletor tem a opção de mandar só o som do programa daquela
  janela, em vez do som do PC inteiro (o programa inteiro: num navegador, vão todas as
  abas dele). Vem desligada; marcou, fica lembrada. O som é pego por um processo
  separado do app: se o Windows não deixar ou der erro, aparece um aviso e vai o som do
  PC, como sempre.
- **Configurações como popup**: em vez de abrir uma janela a mais (que ficava no canto
  da tela ao minimizar), as Configurações abrem por cima da sala, dentro da própria
  janela do app, com o fundo escurecido. Muda o que precisa e fecha: no ×, no **Esc**,
  clicando fora ou no **Ctrl+,** de novo. Minimiza e muda de tamanho junto com o app.
- **Fixar a lista de pessoas** (pedido do Paolinho): o « no topo da lista agora fixa ela
  do lado. O « vira um × (com uma transiçãozinha), a lista fica sempre aberta na coluna
  dela e as transmissões se ajeitam no resto; fica salvo. O × solta e esconde de novo.

### Acabamento da interface
Uma passada de polimento na sala inteira (entrada, sala, perfil, painel), no
computador e no celular, mantendo o visual:
- **Perfil > Conta**: os campos de senha apareciam esmagados (uma linha fininha); agora
  são campos normais, e os dois botões de salvar (nick e senha) têm o mesmo peso.
- **No celular**: o "Detalhes" do topo passava por cima do botão do OBS (agora é o ícone
  do gamepad, como os outros botões); a barra de cima de cada transmissão quebrava em
  duas linhas e o nome aparecia cortado ("Pa…"). Nos quadros pequenos de toque saem as
  estatísticas e a barrinha de volume (o mudo fica); fixando o quadro, elas voltam.
- **"Detalhes"** ganhou o ícone do gamepad e só mostra a contagem quando tem controle
  conectado (o "0" fixo era ruído).
- **Painel de administração**: título "Administração" (com o nome da sala embaixo), as
  abas numa linha só no celular (rolam de lado), sem o vão no fim dos cartões e a lista
  de quem está na sala explica o que aparece ali quando está vazia.
- **Lista de pessoas**: os botões do rodapé ficaram juntos e o seu nome cabe mais.
- Texto apagado (versão, horários, dicas) com mais contraste; textos curtos sem palavra
  sozinha na última linha; seleção de texto, cursor de digitação e textos de exemplo dos
  campos nas cores da sala.
- Passada do detector do Impeccable (as regras automáticas de qualidade de interface):
  - **Botões principais** (Entrar, Compartilhar tela): o degradê ficou um pouco mais fundo
    (do violeta ao azul) e o texto branco passa a ter contraste de leitura em todo o
    rótulo; antes, na ponta azul-clara, ficava quase ilegível.
  - **Menos brilho neon**: saíram os halos coloridos em volta de botões, pontinhos de
    status, selos, do texto "ao vivo" e dos cartões. Os anéis que mostram estado
    (foco, transmissão fixada, quem está falando, controlando) continuam. O brilho dos
    botões virou uma sombra de elevação (`--glow`, que um tema pode trocar de volta
    pelo neon).
  - **Entrada**: o logo fica ao lado do título, não num quadradinho em cima dele.
  - Selos e etiquetas (AO VIVO, OBS, NOVO, contagens, HEX) com pelo menos 11px; a
    versão com 12px; o título do chat não encosta mais na linha de baixo.

### Navegador igual ao app
- **As Configurações do navegador agora são as mesmas do app**: o mesmo popup, com as
  mesmas abas (Perfil, Mouse e efeitos, Ponteiro e controle, Conexão e testes, OBS e
  overlays, Atalhos). No navegador só não aparecem as partes que existem só no app
  (Aplicativo, Log, servidor, marcações na tela, driver do gamepad e controle remoto).
  Antes o navegador tinha diálogos próprios (Perfil, OBS, Atalhos, Testar conexão,
  Mouse e controle), com outro visual.
- Tudo abre nelas, no navegador e no app: a **engrenagem** (agora também no navegador),
  a sua fotinha, os links **Perfil**, **Atalhos** e **Testar conexão**, o botão **OBS**
  (direto na aba do OBS), o **Mouse e controle**, a tecla **?** e o **Ctrl+,**. No app,
  esses botões abriam os diálogos antigos da página, misturando os dois visuais.
- A aba **OBS e overlays** ganhou o teste da porta UDP e a dica de Saída do OBS (H.264,
  6000 Kbps, quadro-chave de 1 s), que só existiam no diálogo antigo.
- Configurações também passaram pelo detector: o mesmo degradê legível dos botões, sem o
  brilho colorido e sem o rótulo em cima do título.

### Temas (a base)
- A sala ficou pronta pra receber **temas** (CSS próprio, como os do Discord): todas as
  cores, fundos e cantos saem de variáveis, tem uma camada de **papel de parede** (com
  desfoque e escurecer) e o tema entra por último, antes de a página aparecer. Ainda
  sem tela pra escolher; dá pra testar pelo console (`WssTheme.set(...)`). Tudo
  explicado em [THEMES.md](https://github.com/UsuarioDeJava/web-screen-share/blob/main/THEMES.md).

### Transmissão e captura (Paolinho)
- **Perfis de captura**, no botão **Transmissão** do topo: Tela e texto (30 FPS), Jogo até
  1080p60 e Jogo até 720p60, mantendo a proporção da fonte. Prefere H.264 quando dá,
  com os outros codecs de reserva.
- Durante a transmissão: priorizar **Fluidez** ou **Nitidez do texto**, desligar a
  prévia local e um **limite total de upload** dividido entre quem assiste.
- O **(i)** de cada vídeo mostra decoder, tempo de decodificação e jitter buffer.
- Com perfil de jogo ou controle remoto, a sala renova a conexão de mídia se o atraso
  ficar preso depois de a rede voltar (no máximo a cada 60 s, sem perder a captura).
- A fonte que some por um tempo é acompanhada até voltar; mudar de tamanho recalcula os
  limites de envio.
- **Captura nativa experimental** (Windows x64, aba **Experimental** das Configurações):
  transmite uma janela em H.264 pra um espectador, com o motor próprio do app.

### Controle remoto: comandos mais rápidos (Paolinho)
- Os comandos vão por canais WebRTC próprios, num formato binário. Com a rede
  congestionada, o app espaça os eixos e gatilhos e mantém os botões no canal confiável.
- Comando demais de uma vez bloqueia a permissão (e avisa), em vez de travar o PC.
- A vibração do gamepad virtual volta pra quem controla.

### OBS
- **Sem contas, cada participante tem o próprio endereço e token** (Configurações > OBS e
  overlays): a transmissão fica ligada à pessoa, vale por até 8 horas e acaba quando ela
  sai da sala. O endereço antigo `/obs/NICK` continua, com um `OBS_PUBLISH_TOKEN`
  opcional no servidor (sem vínculo com a pessoa).
- O botão **OBS** da sala abre direto Configurações > OBS e overlays, com o teste da
  porta UDP.

### Servidor e segurança (Paolinho)
- **Chave de acesso opcional** pra entrar na sala (`ROOM_ACCESS_KEY`, ou uma chave por
  pessoa em `ROOM_ACCOUNT_KEYS`), com sessão em cookie seguro.
- Credenciais do TURN com validade e limites de emissão (por pessoa e no total);
  quotas no coturn embutido; MediaMTX com UDP direto opcional.
- **Seleção experimental de relay** e as rotas da sessão no diagnóstico.

### App (Paolinho)
- **Atalhos**: Configurações > Atalhos mostra quais atalhos globais estão ativos, em
  conflito ou esperando (desenho, controle), com **Tentar registrar novamente** sem
  reiniciar e os botões Ativar desenho e Revogar controle.
- **Desempenho visual**: Completo, Econômico ou Automático (reduz partículas e brilhos
  quando a interface atrasa).
- **Diagnóstico**: copiar as métricas da sessão e amostras por condição (Wi-Fi, cabo,
  VRR...).

### Correções
- Reiniciar ou atualizar o servidor (o container): a sala reconecta sozinha. Antes, com o
  desligamento novo do servidor, ela ficava parada até recarregar a página.
- Celular: o botão **Transmissão** ganhou ícone e não vaza mais pra fora da tela.

## 1.8.1 — 2026-11-19

- **Rolagem pros lados nas animações**: Shift + rodinha (e a rolagem lateral do touchpad)
  agora aparece como as outras rolagens, pra esquerda ou pra direita, em todos os estilos
  de clique (mini mouse com a setinha do lado, ondinha, estrelinhas, corações, confete,
  raios, explosão e quadrinhos). Antes ela era ignorada.
- **Controle remoto**: rolar pros lados controlando alguém (Shift + rodinha ou touchpad)
  agora rola pros lados no PC de lá; antes o Chrome transformava Shift + rodinha em
  rolagem lateral e o controle só mandava a vertical, então nada acontecia.

## 1.8.0 — 2026-11-19

### Correções
- **Pincel "Rastro que some"**: desenhar com ele fazia o app inteiro piscar em preto e o
  traço quase não aparecia. Cada pedacinho do traço era um elemento novo, animado
  sozinho, dentro de um desenho com sombra desfocada do tamanho do vídeo: o navegador
  redesenhava tudo com desfoque a cada quadro e criava/destruía camadas sem parar (em
  placa de vídeo com tela 2K, isso pisca). Agora o rastro são poucos traços fixos que
  vão ficando transparentes, sem desfoque: mais leve até que o pincel normal.
- **Animações de clique paradas onde você clicou**: antes elas iam junto do mouse (clicou
  e mexeu, o clique era arrastado) e um clique novo apagava o anterior (os confetes
  sumiam do nada). Agora cada clique (e cada giro da rodinha) fica no lugar onde
  aconteceu, na sala, na sua tela, na tela de quem transmite e na prévia.

### Transmissão ativa/inativa (privacidade do seu mouse)
- O seu mouse funciona como numa janela do Windows: ele só aparece numa transmissão (pra
  quem transmite, na tela de verdade, e pra quem assiste junto) **depois que você clica
  nela**. A transmissão ativa ganha a borda na sua cor.
- Clicou fora (outro quadro, o chat, a lista...), trocou de programa ou escondeu a página:
  a transmissão fica inativa e o seu mouse some de lá. O clique que ativa já conta.
- Passando por cima de uma transmissão inativa, aparece "Clique na transmissão pra mostrar
  o seu mouse".
- O liga/desliga do seu mouse saiu das Configurações e foi pra **cima de cada
  transmissão** (o botão da setinha), pra desligar só em transmissões específicas. A
  escolha fica salva por pessoa que transmite. O ping (Alt + clique) e o pincel continuam
  funcionando com o mouse desligado.

### Mouse e efeitos: mais opções, menos repetição
- Saíram as opções repetidas: a setinha "Redonda" (igual à clássica), o rastro "Bolinhas"
  (o arco-íris e as bolhas cobrem) e o ping "Pulso" (igual ao clássico). Quem usava fica
  com a mais parecida. O pincel "Giz" virou "Pontilhado".
- **Setinhas novas**: foguete, aviãozinho, patinha, fantasminha, coração e estrela, e o
  tamanho **Enorme**.
- **Cor do contorno** (branco, preto ou uma cor), na setinha e na borda da bolinha da foto.
- **Enfeites novos**: chapéu de mago, gorro de Natal, boné, chapéu pirata, capacete viking,
  orelhas de coelho e boné de hélice (a hélice gira).
- **Efeitos novos**: pulinho, balançando e estrelinhas piscando.
- **Rastros novos**: neve, notas musicais, fumaça e pixels.
- **Cliques novos**: corações, raios e explosão.
- **Pings novos**: alfinete e bandeira, e mais emojis (❓ ✅ ❌ ⚠️ 💰 👻 😎 🤔 🚀 👏 🎁 🎄).
- **Sons novos do ping**: moedinha e laser.
- **Pincéis novos**: contorno, purpurina (brilhinhos coloridos caindo) e flecha (a ponta
  acompanha o fim do traço).
- **Pacotes novos**: Mago, Pirata, Espacial, Natal, Assombrado e Gatinho.

### Imagem própria
- **Setinha com a sua imagem**: PNG, GIF (animado também), WebP ou um cursor do Windows
  (**.cur** e **.ani**, com a ponta que vem no arquivo). Imagens grandes são reduzidas (até
  128 px) e as animadas continuam animadas (o .ani vira PNG animado, com transparência
  suave). Clique na imagem, no editor, pra marcar onde fica a ponta.
- No seu próprio mouse, a imagem é o cursor de verdade do sistema (sem atraso) e, se for
  animada, troca de quadro também. Os outros veem a imagem nos quadros e na tela de quem
  transmite.
- **Ping com a sua imagem** (PNG, JPG, WebP ou GIF), pulando onde você der o ping.
- As imagens ficam salvas no navegador (como a foto) e vão de novo sozinhas quando você
  entra. Também dá pra escolher pelas Configurações do app.

### Outras
- Uma mudança de estilo feita logo antes de um ping ou desenho já sai junto com ele.

## 1.7.0 — 2026-11-19

Compartilhamento de gamepads (PR #4, do Paolinho).

- **Gamepad à distância**: quem assiste pode mandar o controle físico dele pro PC de quem
  transmite o jogo, que recebe como um controle de Xbox virtual. Até quatro gamepads ao
  mesmo tempo.
- **Permissões por pessoa**: o 🎮 da lista (e o painel Mouse e controle) agora deixa
  escolher **teclado**, **mouse** e **gamepad** pra cada participante, em vez de um "pode
  controlar" só. Teclado e mouse: uma pessoa por vez.
- **Detalhes do compartilhamento**: quem transmite acompanha quem está conectado,
  recebendo e autorizado, pode pausar os gamepads, mudar o limite e revogar cada pessoa
  (ou todas).
- **Configurar o seu controle**: visualizador ao vivo do gamepad, presets de Xbox e
  PlayStation, botões extras, gatilhos analógicos com calibragem e limites, mapeamento
  pelo desenho do controle e teste de vibração por motor.
- **Instalar driver e DLL do gamepad** (Configurações → Ponteiro e controle → Meu
  gamepad, Windows x64): baixa o ViGEmBus e a ViGEmClient.dll do fabricante, confere os
  hashes SHA256 e a assinatura do instalador, instala o driver (só ele pede
  administrador) e avisa quando reiniciar. Só o PC que recebe os comandos precisa disso.
- **Servidor local no Windows**: scripts pra subir o servidor no próprio PC e
  correção da tela de confiar no certificado na primeira abertura.
- Detalhes, requisitos e limites no GAMEPAD.md.

## 1.6.0 — 2026-11-18

### Mouse e efeitos (aba nova no Perfil; no app, nas Configurações)
- Escolha o seu mouse e as suas marcações, com **prévia ao vivo** pra testar e **pacotes
  prontos**: setinhas (clássica, do PC, redonda, pixel, mãozinha, mira, lápis, espadinha,
  varinha) em três tamanhos, enfeites (coroa, cartola, chapéu de festa, auréola,
  chifrinhos, orelhas de gato, lacinho, florzinha, anteninhas), efeitos (brilho,
  arco-íris, pulsando), rastros (brilhinhos, bolinhas, arco-íris, corações, bolhas, fogo)
  e o seu nome junto do mouse.
- Animações de clique e rodinha (mini mouse, ondinha, estrelinhas, confete, quadrinhos
  "CLICK!"), estilos de ping (clássico, alvo, alerta, seta caindo, pulso, emoji) com som
  à escolha, e pincéis (normal, neon, tracejado, giz, marca-texto, arco-íris, rastro que
  some) em três espessuras.
- Todo mundo vê do seu jeito: quem assiste junto, nos quadros, e quem transmite, na tela
  de verdade. Fica salvo como a cor e a foto.

### Sincronização e desempenho (PR #3, do Paolinho)
- Ligar e desligar as marcações na tela durante uma transmissão não deixa mais os
  indicadores e as permissões fora de sincronia; salvar outras preferências não recria
  as janelas.
- O log ao vivo das Configurações manda só os eventos novos (não reconstrói a lista) e
  para de atualizar com o painel escondido ou pausado.
- Uma foto sendo enviada não trava mais as outras ações das Configurações; as
  configurações são gravadas sem risco de corromper o arquivo; a janela volta pra uma
  área visível se o monitor salvo sumiu.
- Diagnóstico de decodificação do vídeo recebido e reconexão automática (limitada) quando
  os dados chegam mas a imagem para de andar.

## 1.5.0 — 2026-11-18

### Configurações do app (PR #2, do Paolinho)
- **Uma janela de Configurações** (engrenagem ao lado do seu nome, clique no avatar/nome
  ou **Ctrl+,**): Perfil, Ponteiro e controle, Aplicativo, Conexão e testes, OBS e
  overlays, Log em tempo real e Atalhos. A sala continua conectada enquanto você mexe.
- **Log em tempo real**: participantes, transmissões, conexões e erros, com busca,
  filtros, pausa e exportação em JSON (sem conteúdo do chat ou da mídia).
- **Tela cheia "sem bordas"** (Windows): alternativa à tela cheia nativa, cobrindo o
  monitor sem moldura, pra quem tinha engasgos na tela cheia.
- O OBS saiu da tela principal e foi pras Configurações (endereço WHIP e monitor das
  marcações, incluindo desligado).

### Também
- O seletor de cor das Configurações é o mesmo da sala (estilo Discord), em vez do seletor
  padrão do sistema.
- Botões com degradê: a bordinha mostrava a ponta errada do degradê (clara à esquerda,
  escura à direita); corrigido.
- O seu mouse em cima de uma transmissão virou o **cursor de verdade do sistema** (a
  setinha na sua cor, sem atraso nenhum); a bolinha com a foto (GIF animado também) vem
  logo atrás. Acaba o mouse "pesado" e os pulos ao entrar em tela cheia.
- Em tela cheia, nada com desfoque por cima do vídeo (era redesenhado a cada quadro).

## 1.4.6 — 2026-11-18

- **Tela cheia lisa em monitor G-SYNC/FreeSync**: com só o vídeo mudando, o monitor caía
  pra ~30 Hz e o mouse travava na tela inteira. Agora o app mantém o monitor na taxa
  máxima.
- **Seletor de cor completo no perfil** (estilo Discord): automática, 20 cores prontas e
  personalizada (quadrado de saturação e brilho, faixa do tom, HEX e RGB, conta-gotas,
  cores da sua foto e recentes). A cor exata vai pra todo mundo; nomes em cor escura
  clareiam só o bastante pra ler, e cores claras ganham letra escura.
- As marcações na tela de verdade usam a cor exata de cada pessoa.
- "Tirar a foto" virou "Remover foto".

## 1.4.5 — 2026-11-18

- Marcações na tela de verdade (ping, nomes, reações, traços e mouses) um terço menores.
- A barra do modo desenho (Ctrl+Shift+D) cabe numa linha, mesmo com escala de tela alta.
- **Animação de clique**: clicar (esquerdo, direito, rodinha) ou rolar em cima de uma
  transmissão mostra um mini mouse com a parte apertada acesa, com uma ondinha no clique.
- Traços com o Alt apertado ficam enquanto o Alt estiver apertado (vários seguidos) e
  somem quando você solta.

## 1.4.4 — 2026-11-17

- Botão **Verificar atualização** no app: procura versão nova na hora e também avisa
  quando o servidor foi atualizado.
- **Controlando, esconda tudo de cima da transmissão** (botão de olho ou Ctrl+Shift+H),
  pra clicar em qualquer canto da tela de lá.

## 1.4.3 — 2026-11-17

- **Controle remoto com todos os atalhos**: controlando pelo app (Windows), a tecla do
  Windows, Alt+Tab, Alt+F4 e os atalhos de outros programas vão pro PC de lá em vez de
  agir no seu. No navegador, o mesmo em tela cheia.
- Quem transmite não tem mais a tecla do Windows bloqueada.
- **Quem assiste vê o mouse de quem assiste junto**, nos quadros.
- Fotos de perfil (GIF) de até 5 MB.

## 1.4.2 — 2026-11-16

- **Perfil**: escolha a sua cor e uma foto (GIF animado também). Aparecem na lista, no
  chat, nos quadros, nos rabiscos e no mouse, e ficam salvas no navegador.
- O seu mouse em cima de uma transmissão vira a mesma setinha com foto que quem
  transmite vê.

## 1.4.1 — 2026-11-16

- **Você tem prioridade sobre o seu mouse**: mexer no seu mouse enquanto alguém controla
  pausa o controle da pessoa até você parar.
- **Ctrl+Shift+X** mais confiável: tira o controle na hora, mesmo que outro programa use o
  atalho.

## 1.4.0 — 2026-11-16

- **Aviso de atualização**: o app procura versão nova ao abrir e a cada 6 horas; a versão
  instalada se atualiza pelo botão **Atualizar** (a portátil mostra o link).
- Botão de dar o controle (🎮) em cada pessoa da lista, enquanto você transmite pelo app.
- A sua própria transmissão do OBS não abre mais sozinha.
- O botão do mouse embaixo da lista abre o painel **Mouse e controle**.

## 1.3.0 — 2026-11-16

- **Mouse de quem assiste na sua tela**: transmitindo pelo app, o mouse de quem assiste
  aparece na sua tela de verdade, na cor da pessoa (dá pra desligar dos dois lados).
- **Controle remoto**: quem transmite pode deixar uma pessoa controlar o mouse e o
  teclado (desligado por padrão); **Ctrl+Shift+X** tira o controle a qualquer hora.

## 1.2.0 — 2026-11-16

- **Modo desenho** (Ctrl+Shift+D, de qualquer programa): rabisque na sua tela de verdade
  enquanto transmite, ao vivo pra quem assiste, com cores, desfazer, limpar e sair. O
  jogo continua na frente.

## 1.1.0 — 2026-11-16

- **Marcações na tela também pelo OBS**: com o app aberto na sala, com o mesmo nick da
  transmissão do OBS, os pings, desenhos e reações aparecem na sua tela de verdade.
  Escolha o monitor (ou desligue) no OBS.

## 1.0.0 — 2026-11-16

Primeira versão do app de desktop.

- Abre a sala do seu servidor (a mesma página do navegador, então atualiza junto com o
  servidor).
- **Seletor de tela próprio** com miniaturas e, no Windows, o **som do PC**, mesmo
  transmitindo a tela inteira.
- **Marcações na sua tela de verdade**: transmitindo a tela inteira, os pings, desenhos e
  reações de quem assiste aparecem por cima da sua tela, sem aparecer na transmissão.
- Pede o endereço do servidor na primeira vez, confia num certificado próprio se você
  pedir, lembra o tamanho da janela, mantém a transmissão e a voz lisas minimizado e pisca
  na barra de tarefas com mensagem nova no chat.
- A sala (navegador e app) já tinha: transmissões de tela entre várias pessoas (WebRTC),
  transmissão pelo OBS (WHIP), TURN embutido, chat, reações, "olha aqui" (Alt + clique),
  desenho ao vivo, chat de voz, fixar, picture-in-picture, print e sons.
