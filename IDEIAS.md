# Ideias pro futuro

Coisas pedidas que ainda não foram feitas.

## Feito

- **Personalização do mouse e das marcações** (setinhas, tamanhos, efeitos,
  rastros, animações de clique e rodinha, estilos e sons do ping, pincéis
  e espessuras, prévia ao vivo e pacotes prontos): no **Perfil**, aba **Mouse e
  efeitos** (no app, em **Configurações**). Veja o item 14 do README.
- **Mais opções e imagem própria**: setinha e ping com imagem sua (PNG, GIF, WebP,
  .cur e .ani do Windows), cor do contorno, mais setinhas, efeitos, rastros,
  cliques, pings, sons e pincéis; as repetidas saíram.
- **Animações de clique paradas onde clicou** (não vão junto do mouse).
- **Transmissão ativa/inativa**: o seu mouse só aparece na transmissão que você clicou,
  com um botão em cada uma pra desligar só nela.
- **Controlando: um mouse só** (app 2.0, Windows): o mouse de quem é controlado some
  da captura e o seu fica com o formato dele (seta, texto, mãozinha...).
- **Só o som do programa da janela** (app 2.0, experimental, Windows 10 2004+): quando o
  Electron tiver isso pronto (electron/electron#54628), trocar a captura própria pela
  dele.
- **Usuário de testes** (2.0): o dono marca a conta; a administração vê o selo Teste e
  controla de longe pela sala (transmissão sem prévia no app, controle remoto, voz e
  microfone). Cada comando vai pro log do servidor e pro Log do app dele.

## Próximo

- **Usuário de testes: controle total.** Hoje: transmissão (começar/parar, som), dar e
  tirar o controle, voz, microfone e som. Pra crescer: uma entrada em `COMMANDS`
  (server/testers.js), um handler no app.js e um texto em `LABELS` (tester.js). Ideias:
  perfil de captura, assistir/parar de assistir uma transmissão, chat, Configurações do
  app, reiniciar o app, ler o Log de longe.

## Talvez depois

- Som no clique, além do ping.
- Efeito animado também na sua própria setinha (hoje ela é o cursor do sistema, sem
  atraso, e a animação só os outros veem).
