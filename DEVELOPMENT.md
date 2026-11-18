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
página local. A sala continua conectada. As seções reúnem:

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
agrupadas em 250 ms, sem coleta contínua de estatísticas de vídeo. Fechar/minimizar
 o painel suspende seu envio de atualizações.

O log cobre o que este cliente observa durante a execução, não o histórico completo
 do servidor. O observador não copia conteúdo de chat, áudio/vídeo, SDP ou candidatos
ICE completos. Mensagens conhecidas com credenciais são sanitizadas antes do registro.

## Verificar

Na raiz:

```powershell
node --test desktop/test/borderless-fullscreen.test.js desktop/test/settings.test.js
```

No Windows com sessão gráfica, a partir de `desktop/`:

```powershell
.\node_modules\.bin\electron.cmd test/fullscreen-smoke.cjs
.\node_modules\.bin\electron.cmd test/settings-smoke.cjs
.\node_modules\.bin\electron.cmd test/room-settings-smoke.cjs
```

Os testes Electron usam portas e perfis temporários isolados. O último inicia o
servidor real deste checkout pelo executável `node` no PATH e valida perfil/foto,
ponteiro/sons, diagnósticos, versões, OBS e persistência de monitor. Os testes não
iniciam uma transmissão OBS real nem concedem controle remoto de um PC real.

`WSS_TEST_SCREENSHOT_DIR` permite salvar capturas das páginas durante os testes.
Esses arquivos são opcionais e não fazem parte do instalador. O autoteste original
`--self-test` verifica carregamento e gancho de teclado; ele simula uma tecla no Windows
 e não mede reprodução de vídeo.
