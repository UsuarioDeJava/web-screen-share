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

O monitor visual acompanha o tema escuro do aplicativo. Mostra os 17 botões,
intensidade dos gatilhos e posição dos dois analógicos no desenho e nos gráficos.
Os valores são da **saída mapeada** enviada ao jogo. O mapeamento de cada botão fica
ao lado do desenho; eixos e inversões ficam nos cartões dos analógicos. A zona morta
fica no mesmo painel. As leituras técnicas permanecem abertas no final.

### Presets e botões extras

**Preset do controle** oferece **Xbox**, **PlayStation** e **GameSir / personalizado**.
Os dois primeiros aplicam os índices padrão, os símbolos correspondentes e a
disposição dos analógicos. Selecionar um preset restaura o mapeamento básico e as
inversões; preserva a zona morta e as atribuições extras salvas. As atribuições
extras só são aplicadas no modo personalizado. Ajustes antigos sem preset continuam
com seus índices e zona morta preservados. A seleção inicial por nome do dispositivo
é uma sugestão; o usuário pode trocá-la.

No preset **GameSir / personalizado**, o aplicativo mostra ao vivo até 64 entradas
físicas. Clique em **Adicionar botão extra**, dê um nome (M1, M2, L4, R4 etc.) e escolha
**Enviar como**. **Detectar botão** captura a próxima tecla pressionada enquanto a
janela está em foco, com prazo de 15 segundos; também é possível informar o índice
manualmente. Há até 16 atribuições extras por perfil, com aparência Xbox ou PlayStation.
Os extras também acendem abaixo do desenho do controle.

Um botão extra pode enviar A, B, X, Y, um gatilho ou qualquer outro comando dos
17 botões do controle virtual. A entrada principal continua funcionando: o aplicativo
combina as pressões sem soltar um botão que ainda está apertado por outra entrada.
Nos gatilhos, mantém o maior valor analógico. Remover a atribuição interrompe esse
mapeamento. Isso não cria botões adicionais no dispositivo XInput nem concede acesso
ao teclado: o jogo continua recebendo **Xbox 360**, inclusive com preset PlayStation.

Os botões precisam ser expostos pela [Gamepad API](https://www.w3.org/TR/gamepad/)
como entradas independentes para terem atribuições independentes no aplicativo.
Alguns controles permitem programar teclas traseiras para repetir outros botões no
próprio firmware, como o [GameSir G7 SE](https://gamesir.com/support/manuals/gamesir-g7-se).
Nesses casos, configure a função no software ou no controle do fabricante. O aplicativo
não consegue distinguir duas teclas físicas que chegam como a mesma entrada.

## Detalhes de compartilhamento

O botão **Detalhes**, ao lado de **Compartilhar tela** no canto superior direito,
abre duas abas. **Participantes e permissões** mostra as pessoas da sala, dispositivos
permitidos, nome do gamepad e estado de cada conexão. As contagens distinguem:

- **Com permissão de gamepad:** pessoas autorizadas, mesmo sem controle conectado.
- **Controles conectados:** controle físico informado pelo participante e dispositivo
  virtual confirmado pelo aplicativo do proprietário.
- **Enviando comandos:** conexões confirmadas, com envio ativo e pacotes recentes.

Uma concessão sozinha não é contada como conexão. O painel recebe atualizações
somente das concessões do próprio proprietário; cada participante continua vendo
somente as permissões recebidas para controlar a transmissão. O nome do gamepad é
texto informado pelo cliente, não uma identidade autenticada do hardware.

Em **Configurações**, o proprietário pode reduzir o limite de 1 a 4 participantes,
pausar todos os gamepads e revogar todos os dispositivos. Reduzir o limite exige
revogar permissões excedentes primeiro. Pausar remove os gamepads virtuais e mantém
as permissões; retomar permite conectá-los novamente. As opções valem para a sessão
atual. Encerrar a transmissão ou desconectar continua encerrando as concessões.
Para esta contagem e os novos controles, atualize **servidor e aplicativos**.

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
O projeto original foi arquivado; esta integração é opcional. O portátil avulso
não inclui esses componentes, e detectar um controle físico no monitor não confirma
que o PC consiga receber um controle virtual.

### Preparação pelo aplicativo (Windows x64)

Em **Configurações → Ponteiro e controle → Meu gamepad**, clique em
**Instalar driver e DLL do gamepad**. O aplicativo baixa o instalador oficial
ViGEmBus 1.22.0 e a DLL x64 de uma revisão fixa do repositório ViGEm.NET do fabricante,
confere SHA256 e valida a assinatura do instalador. Se o driver não estiver ativo,
o Windows solicita administrador para instalá-lo. O app continua como usuário normal.
A DLL é preparada no perfil nativo, e as licenças são guardadas com os downloads.
Internet é necessária nesse fluxo; uma falha ou cancelamento permite tentar novamente.

Depois, clique em **Reiniciar aplicativo**. Se o instalador pedir reinicialização
do Windows, reinicie o PC. A seção **Controle remoto** deve mostrar **Gamepad virtual
disponível** antes de marcar Gamepad e clicar em Permitir. Sem driver/DLL, a opção
Gamepad fica cinza; teclado e mouse seguem suas próprias permissões e requisitos.

Esses componentes precisam estar **no computador onde o jogo recebe os comandos**.
Quem apenas envia um controle físico não precisa deles. O contêiner e o Tailscale
transportam os comandos e não substituem o driver do Windows do receptor.

### Pacote com componentes para testes

`scripts/portable-gamepad/build-package.ps1` reúne o portátil de teste, o instalador
assinado, a DLL, licenças e um iniciador em um ZIP em `desktop/dist/`.
Extraia tudo, conecte o Tailscale e execute **INICIAR.cmd**. O iniciador instala o
driver quando necessário, prepara a DLL em um perfil exclusivo do pacote e abre
o app com o servidor de teste configurado. Não inclui perfis pessoais.
Somente o instalador solicita administrador; o driver permanece instalado ao fechar
o app. Um pedido de reinicialização deve ser atendido antes de repetir o iniciador.
O script de empacotamento exige o portátil `1.5.0-gamepad-test` já compilado.

### Preparação manual

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

## Mapeamento visual e gatilhos analógicos

O painel configura um controle físico por vez. Com somente um dispositivo, a escolha
é automática. Cada linha de mapeamento aponta para o botão no desenho e mostra a
pressão enviada, de 0 a 100%. É possível escolher a entrada ou usar Detectar e apertar
o botão físico. Os presets Xbox e PlayStation mudam os símbolos e a posição dos
analógicos. Os detalhes dos analógicos e as leituras técnicas ficam sempre visíveis;
botões extras podem ser expandidos dentro do painel do controle.

LT/L2 e RT/R2 leem o valor analógico do botão padrão. Controles DirectInput também
podem usar eixos; cada gatilho tem origem independente. A área de calibração foi
removida da interface; limites salvos em perfis anteriores são preservados.
A interpolação é linear e
suporta curso invertido ou metades opostas de um eixo compartilhado. Eixos de gatilho
não recebem a zona morta dos analógicos. Meio curso envia aproximadamente 128 de 255
no XInput, enquanto solto e até o fim enviam 0 e 255. O cliente usa o curso completo,
sem os limites fixos de 50% da prévia anterior.

A indicação de pressão intermediária exige observar valores fracionários; somente
extremos observados não prova defeito do sensor. Se o hardware informar apenas 0 ou 1,
o app não consegue medir o curso: confira o modo analógico e a trava no fabricante.
Na validação local do GameSir G7 Pro, o XInput físico registrou vários valores
intermediários nos dois gatilhos. A saída virtual com ViGEmBus real foi conferida em
0%, 10%, 25%, 50%, 75% e 100%. O teste integrado verifica a preservação de frações
através de Socket.IO e IPC; o comportamento de aceleração em um jogo de corrida real
ainda depende de teste no jogo e de sua configuração de entradas.

O teste de vibração dura um segundo, com pequenos botões E e D nos cantos superiores.
E aciona o motor forte e D o motor fraco via dual-rumble; clicar novamente no mesmo
botão interrompe o teste. Controles e modos sem suporte ficam desabilitados.
Fechar o painel, trocar o controle ou perder
foco interrompe o efeito. Este é um teste local, sem retorno de vibração dos jogos
remotos.
