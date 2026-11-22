# Desenvolvimento do aplicativo desktop

O app Electron carrega a sala do servidor configurado. As mudanças em `desktop/`
funcionam no cliente local; alterações em `public/` precisam ser servidas pelo servidor.

## Preparar e executar

Use Node.js 22.12 ou superior para desenvolver esta versão do Electron.
Na raiz do repositório:

```powershell
npm ci
npm --prefix desktop ci
$env:WSS_SERVER = 'http://localhost:3000'
$env:WSS_USER_DATA = Join-Path $env:TEMP 'web-screen-share-dev'
npm --prefix desktop start
```

Substitua `WSS_SERVER` pelo endereço do seu servidor existente. Para testar com o
servidor deste checkout, execute `npm start` em outro terminal na raiz.
O perfil separado evita modificar as preferências do aplicativo instalado.
As opções usam variáveis de ambiente; o projeto não carrega `.env` automaticamente.

## Configurações

A engrenagem ao lado do usuário, o clique no avatar/nome e **Ctrl+,** abrem uma única
página local. A sala continua conectada. Ela abre como popup dentro da janela principal
(`settings-panel.js`): um `WebContentsView` transparente do tamanho da área da janela
(menos a barra de título própria, no modo sem bordas), e a página desenha o fundo
escurecido e o painel no meio. Fecha no ×, no Esc, clicando fora ou no Ctrl+, (IPC
`settings:close`); minimiza e redimensiona com a janela. Nos testes, a página aparece
em `webContents.getAllWebContents()`, não em `BrowserWindow.getAllWindows()`. As seções
reúnem:

- Perfil: foto, remoção de foto, cores prontas, personalizada e automática.
- Ponteiro e controle: compartilhar cursor, mostrar outros cursores, sons de eventos
  e os controles de permissão já disponíveis na sala.
- Aplicativo: tela cheia, aceleração gráfica, marcações e limites do registro.
- Conexão e testes: servidor, diagnóstico existente de TURN/codecs/OBS e cópia do resultado.
- OBS e overlays: endereço WHIP, aviso de certificado e monitor das marcações,
  incluindo Desligado. O botão OBS deixa a tela principal do app.
- Log em tempo real e atalhos do app e da sala.

As preferências nativas ficam no `config.json` do perfil. Servidor, modo de tela cheia
 e aceleração são aplicados após **Reiniciar e aplicar**; salvar não desconecta a sala.
Foto, cor, ponteiro e sons usam os controles e o armazenamento existentes da página
conectada. A escolha do monitor OBS é salva e aplicada imediatamente. Para captura
pelo app, as marcações continuam seguindo a tela escolhida no seletor de captura.
Qualidade, volume e dispositivos de voz permanecem nos controles das transmissões.

O arquivo de configuração é salvo por substituição atômica: a gravação temporária
precisa terminar antes de substituir o JSON anterior. Erros de leitura são registrados
em vez de ignorados silenciosamente. Ao sair da tela cheia, o app verifica novamente
os monitores para evitar restaurar a janela fora das telas disponíveis.

A sala atualizada expõe `wssRoomSettings` versão 1, com leitura de estado e comandos
explícitos. O adaptador antigo de DOM permanece como compatibilidade para servidores
anteriores. Uploads, cores e outros comandos não compartilham mais uma única fila;
leituras e revogação de controle não esperam um upload lento. Fechar o painel ou navegar
cancela a espera local das operações pendentes; um envio já aceito pelo servidor pode
concluir normalmente.

As conversões de cor e a paleta de avatar usam `desktop/shared/color.js`, carregado
também pela sala em `/js/color.js`. A paleta é reutilizada enquanto o endereço/hash da
foto não muda. A imagem Docker inclui esse módulo compartilhado e o instalador inclui
`shared/**`. Para usar o novo contrato e o diagnóstico de vídeo na sala remota, atualize
também os arquivos do servidor/interface; as mudanças não são publicadas automaticamente.

Um mouse só no controle remoto: `desktop/system-cursor.js` (Windows, user32 pela koffi)
deixa os cursores do sistema transparentes enquanto alguém com o mouse liberado está no
modo controle (`control:mode`, repassado pelo servidor) e lê o formato atual
(`GetCursorInfo`), que vai pra quem controla (`control:cursor`, nomes de cursor do CSS).
A camada desenha o mouse de quem transmite (ela fica fora da captura). Um arquivo
`cursor-hidden` na pasta de dados marca o mouse escondido: a próxima abertura do app
devolve. Nos testes fora do Windows, `WSS_FAKE_SYSTEM_CURSOR=1` finge esse cursor
(`WSS_FAKE_CURSOR_SHAPE` escolhe o formato).

O estilo do mouse e das marcações (setinhas, efeitos, rastros, cliques, pings, pincéis,
o editor com prévia e os pacotes) fica em `desktop/shared/fx.js` e `fx.css`, servidos à
sala em `/js/fx.js` e `/css/fx.css` e usados direto pela camada (`overlay.html`) e pelas
Configurações (aba Mouse e efeitos). O servidor só confere o formato do estilo
(`cleanStyle`); o catálogo e a validação dos valores (`normalize`) ficam no fx.js. Nas
páginas do app vale CSP sem `unsafe-inline`: nada de atributo `style` em HTML montado por
string (use atributos SVG ou `element.style`).

Imagens próprias (setinha e ping): `desktop/shared/fx-image.js` (servido em
`/js/fx-image.js`) lê .cur/.ani (com a ponta do arquivo), reduz até 128 px e junta
animações em APNG; as partes só de bytes têm teste no Node (`desktop/test/fx-image.test.js`).
A sala manda pelo evento `fx:image` (até 2 MB e 256 px, no mesmo armazenamento das
fotos) e o servidor devolve `cursorImg`/`pingImg` na lista; o estilo guarda só a ponta
(`hx`, `hy`, em %). As Configurações do app usam as ações `fx-image` e `fx-image-remove`.

O mouse de quem assiste só é enviado na transmissão "ativa" (a última clicada; clicar
fora, trocar de programa ou esconder a página desativa), e cada transmissão tem o seu
liga/desliga (`wss-cursor-streams`, por nick de quem transmite). Tudo isso é só no
navegador de quem assiste.

## Versões e novidades

Toda versão nova do app (`desktop/package.json`) ganha a sua seção `## x.y.z — data` no
`CHANGELOG.md`, com o que muda pra quem usa (sala e app, com o crédito dos PRs). O workflow
**Release notes** (`scripts/release-notes.js`) põe essa seção nas notas da release
`desktop-vx.y.z` depois de cada build do app, e atualiza todas as releases quando o
`CHANGELOG.md` muda.

## Tela cheia e diagnóstico gráfico

O padrão continua sendo a tela cheia nativa. No Windows também estão disponíveis:

- **Sem bordas:** janela sem moldura que cobre o monitor inteiro e oculta a barra
  local, mantendo a aceleração de hardware. Não chama `setFullScreen()`.
- **Em janela:** fullscreen HTML dentro da janela; F11 maximiza/restaura.

No modo sem bordas, Esc/F11 restauram a posição, tamanho e maximização anteriores.
A prioridade sobre outras janelas é removida ao perder o foco. É uma alternativa
para comparar engasgos de apresentação em tela cheia; os testes de geometria e
restauração não comprovam desempenho de vídeo em todas as combinações de GPU/monitor.

Sobrescritas opcionais para uma execução:

```powershell
$env:WSS_BORDERLESS_FULLSCREEN = '1'
# Ou WSS_WINDOWED_FULLSCREEN=1 para o modo em janela.
# WSS_DISABLE_HARDWARE_ACCELERATION=1 desativa a aceleração para diagnóstico.
npm --prefix desktop start
```

A desativação global da aceleração pode aumentar a carga de CPU e piorar o vídeo.
O reinício pelo painel remove as sobrescritas gráficas e de servidor para usar as
preferências salvas; `WSS_USER_DATA` é preservado. Feche a instância anterior antes
 de iniciar outra com o mesmo perfil. `--settings` abre o painel ao iniciar.

## Log

O registro resume eventos Socket.IO, participantes, transmissões, visualizações,
conexões WebRTC/ICE, reconexões e erros da interface/processos. Cada linha contém
horário, direção, categoria e nível. O histórico fica em memória até exportar JSON.
Há busca, filtros, pausa da visualização sem interromper o registro e limpeza.

O limite é configurável entre 500, 1000, 2000 e 5000 eventos. São aceitos até 100
novos eventos por segundo; excessos são contabilizados. Atualizações visuais são
agrupadas em 250 ms e enviam somente os eventos novos. O buffer circular mantém o limite
sem deslocar o histórico a cada evento, e a tabela preserva as linhas já renderizadas.
Ocultar a aba, pausar, fechar ou minimizar o painel suspende o envio de atualizações.
Retomar sincroniza os eventos pendentes; uma limpeza ou histórico excedido solicita uma
ressincronização completa. A coleta do registro continua ativa na memória durante a pausa.

O log cobre o que este cliente observa durante a execução, não o histórico completo
 do servidor. O observador não copia conteúdo de chat, áudio/vídeo, SDP ou candidatos
ICE completos. Mensagens conhecidas com credenciais são sanitizadas antes do registro.

## Progresso do vídeo

Conexões recebidas ativas consultam estatísticas a cada dois segundos, sem sobrepor
consultas. Ao pausar/ocultar o vídeo ou desconectar, a observação de progresso é reiniciada.
Os detalhes mostram quadros decodificados, descartados, congelamentos e tempo médio de
decodificação, quando fornecidos pelo navegador.

Uma recuperação só é sugerida quando os bytes de vídeo continuam chegando sem novos
quadros decodificados por pelo menos 12 segundos. Tela estática sem novos bytes não
provoca reconexão. Reconexões dessa recuperação são limitadas a uma por minuto por
transmissão. O mecanismo não tenta corrigir engasgos de apresentação da GPU quando a
decodificação continua avançando; esses casos ainda precisam de comparação no hardware.

## Verificar

Na raiz:

```powershell
node --test desktop/test/borderless-fullscreen.test.js desktop/test/settings.test.js desktop/test/reliability.test.js desktop/test/gamepad.test.js
node --test desktop/test/gamepad-setup.test.js
```

No Windows com sessão gráfica, a partir de `desktop/`:

```powershell
.\node_modules\.bin\electron.cmd test/fullscreen-smoke.cjs
.\node_modules\.bin\electron.cmd test/settings-smoke.cjs
.\node_modules\.bin\electron.cmd test/room-settings-smoke.cjs
.\node_modules\.bin\electron.cmd test/stream-overlay-smoke.cjs
```

Os testes Electron usam portas e perfis temporários isolados. O teste de configurações
da sala inicia o servidor real deste checkout pelo executável `node` no PATH e valida perfil/foto,
ponteiro/sons, diagnósticos, versões, OBS e persistência de monitor. Os testes não
iniciam uma transmissão OBS real nem concedem controle remoto de um PC real.

`stream-overlay-smoke.cjs` usa dois clientes e vídeo WebRTC real gerado por um canvas
animado. Nenhuma imagem da tela do usuário é capturada. Verifica que desativar e reativar
overlays atualiza a sala sem trocar a captura, que salvar opções não relacionadas não
recria o overlay, e que o receptor continua decodificando quadros em fullscreen do vídeo,
após Esc e em F11. O seletor/IPC é exercitado com uma fonte sintética, sem acionar a
captura nativa do Chromium. Não é um benchmark de captura real, áudio ou GPU/VRR.

`WSS_TEST_SCREENSHOT_DIR` permite salvar capturas das páginas durante os testes.
Esses arquivos são opcionais e não fazem parte do instalador. O autoteste original
`--self-test` verifica carregamento e gancho de teclado; ele simula uma tecla no Windows
 e não mede reprodução de vídeo.
