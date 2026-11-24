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
- **Controlando: um mouse só** (app 1.9, Windows): o mouse de quem é controlado some
  da captura e o seu fica com o formato dele (seta, texto, mãozinha...).
- **Só o som do programa da janela** (app 1.9, experimental, Windows 10 2004+): quando o
  Electron tiver isso pronto (electron/electron#54628), trocar a captura própria pela
  dele.

## Próximo

Junto com a PR de fixes do Paolinho:

- **Usuário de testes** (plano combinado):
  - Caixinha "Usuário de testes" na criação da conta e na lista do painel. Pra quem usa
    a conta, nada muda (primeiro acesso pede senha nova, experiência de usuário comum).
  - O selo "Teste" aparece só pros administradores. Se a conta de testes também tiver
    administração, ela não vê o próprio selo nem pode controlar a si mesma.
  - Qualquer administrador vê, na lista de pessoas, um botão no usuário de testes
    (online) que abre um painel de controle remoto: estado dele (app ou navegador,
    transmitindo, na voz) e comandos executados como se fosse ele. Começo:
    iniciar transmissão (só os nomes das telas e janelas, sem prévia; com "só o som do
    programa"; só no app 1.9+, no navegador é indisponível), parar, permitir e tirar o
    controle de alguém (teclado, mouse, gamepad), entrar e sair da voz, mutar. Meta:
    controle total, então a lista de comandos tem que crescer fácil.
  - Servidor: guarda a marca, repassa só comandos de uma lista fechada, confere que
    quem manda tem administração e que o destino é de testes. Cada comando vai pro log
    do servidor e pro Log do app do usuário de testes (depuração).
  - Permissões do painel: só o dono marca "Conta com administração" e "Usuário de
    testes". Os outros administradores criam e mexem só em contas normais (não tocam
    em contas de administração, de testes nem na do dono), mas controlam as de testes.

## Talvez depois

- Som no clique, além do ping.
- Efeito animado também na sua própria setinha (hoje ela é o cursor do sistema, sem
  atraso, e a animação só os outros veem).
