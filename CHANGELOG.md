# Novidades

Cada versão do app de desktop, da mais nova pra mais antiga. O que muda na sala (no
navegador e no app) chega com a atualização do servidor; o que é do app (seletor de
tela, marcações na tela de verdade, controle remoto, Configurações) chega com a versão
nova do app. As notas de cada release no GitHub vêm daqui.

## 1.9.0 — Melhorias de transmissão e controle

- A sala ganhou diagnóstico de rota e estatísticas por transmissão, perfis de captura e ajustes experimentais de vídeo.
- O controle remoto usa canais WebRTC para comandos. Sob congestionamento, o app espaça os envios de eixos e gatilhos e mantém as transições de botões no canal confiável.
- O servidor oferece autenticação individual opcional, credenciais por publicação do OBS e limites para uso do relay.
- No Windows x64, a captura nativa experimental transmite uma janela em H.264 para um espectador. O áudio do sistema continua disponível pela captura padrão.

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
