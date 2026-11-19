# Gamepad e permissões por participante

Esta implementação permite compartilhar um gamepad físico com o computador que
transmite o jogo. O proprietário escolhe **teclado**, **mouse** e **gamepad**
separadamente para cada pessoa. Até quatro pessoas podem ter gamepad autorizado no
mesmo computador; teclado e mouse podem ser liberados para uma pessoa por dispositivo.
É possível, por exemplo, liberar teclado para uma pessoa, mouse para outra e gamepads
para outras quatro. Nenhuma opção começa marcada.

## Configurar o seu controle

No aplicativo, abra **Configurações → Ponteiro e controle → Meu gamepad → Configurar
e testar meu controle**. Conecte o controle e pressione um botão para ele aparecer.
Escolha o dispositivo físico e ajuste os índices dos botões, eixos, inversões e zona
morta. A prévia mostra os botões físicos pressionados e a saída mapeada. Os índices
começam em zero. Controles que o Chromium identifica como `standard` já começam com
o mapeamento padrão; os demais podem exigir ajuste manual. Esta versão suporta
botões originados de botões e analógicos originados de eixos; converter gatilhos ou
direcional de eixo em botão ainda não está incluído.

O perfil é salvo por identificação do gamepad no `config.json` nativo do aplicativo,
com limite de 32 perfis. Ele acompanha a troca de servidor neste mesmo aplicativo.
No navegador, fica no armazenamento local daquele endereço. Dois controles físicos
com a mesma identificação compartilham o perfil; cada participante envia um controle
selecionado por vez.

O mapeamento é aplicado **antes de enviar os comandos**. Assim, qualquer computador
que autorizar essa pessoa recebe o mesmo layout, apresentado ao jogo como um controle
**Xbox 360/XInput**. O modelo físico original não é clonado. O estado é enviado somente
ao proprietário da transmissão que a pessoa escolheu controlar, sem expor comandos
aos demais participantes.

## Preparar o computador que recebe os comandos

Atualize tanto o servidor quanto o aplicativo. Para receber gamepad virtual é preciso
Windows, o **driver ViGEmBus** instalado e a biblioteca **ViGEmClient.dll** compatível
com a arquitetura do aplicativo. A integração usa o [SDK ViGEmClient](https://github.com/nefarius/ViGEmClient)
e o formato [XUSB_REPORT](https://github.com/nefarius/ViGEmClient/blob/master/include/ViGEm/Common.h).
O projeto original foi arquivado; esta integração é opcional e não instala nem
redistribui automaticamente o driver ou a DLL.

Use os componentes do projeto oficial [ViGEmBus](https://github.com/nefarius/ViGEmBus)
e do SDK, respeitando as respectivas licenças. Copie a DLL para o caminho exibido em
**Meu gamepad**, no perfil nativo do aplicativo:

```text
<userData>/gamepad/<arquitetura>/ViGEmClient.dll
```

Em builds Windows de 64 bits a arquitetura é `x64`. Em desenvolvimento, `userData`
respeita `WSS_USER_DATA`. Reinicie o aplicativo após preparar esses componentes.
Se o driver ou a DLL não estiverem disponíveis, o painel informa o motivo e desabilita
a opção de conceder gamepad. Configurar e testar o controle físico continua possível.

## Jogar e revogar

1. O proprietário transmite a tela inteira pelo app, ou usa OBS com as marcações
   habilitadas no monitor correto.
2. Em **Configurações → Ponteiro e controle → Controle remoto**, marca os dispositivos
   de cada pessoa e clica em **Permitir**. **Aplicar permissões** altera uma concessão
   existente; **Revogar** remove somente aquela pessoa.
3. A pessoa autorizada clica no botão de controle no quadro da transmissão. O gamepad
   é transmitido enquanto o aplicativo está em primeiro plano. Mouse e teclado seguem
   a área da transmissão; o gamepad funciona também com o ponteiro fora do vídeo.
4. O jogo deve reconhecer um controle Xbox virtual por participante ativo. Slots
   XInput ocupados por controles locais podem reduzir os slots disponíveis. Alguns
   jogos exigem conectar o controle antes de abrir o jogo.

**Ctrl+Shift+X**, no proprietário, revoga todos os dispositivos imediatamente.
Desconectar, parar a transmissão ou fechar as marcações também encerra as concessões
relacionadas. Perder o foco, parar de controlar ou desconectar o gamepad envia estado
neutro. No receptor, um watchdog solta o gamepad após um segundo sem estados novos,
preservando o slot até a revogação. Não há vibração de retorno nesta versão.

## Validação e limites

Os comandos usam o Socket.IO existente, com validação de permissão por dispositivo,
quatro eixos, 17 botões e valores finitos dentro dos limites. Há até aproximadamente
60 atualizações por segundo quando o estado muda e um heartbeat de 250 ms quando ele
fica parado. Esta versão não implementa canal de comandos WebRTC dedicado, ajuste de
latência equivalente ao Parsec nem medidas de desempenho em jogos.

Os testes cobrem isolamento de permissões, revogação, slots, estados inválidos,
conversão XInput, neutralização e persistência. O smoke Electron exercita detecção e
mapeamento com controle simulado, dois participantes autorizados, servidor real,
transporte Socket.IO, IPC e vídeo WebRTC sintético. O driver nativo é simulado nesses
testes: ainda é necessário validar com ViGEmBus/DLL reais e gamepads físicos em jogos.
