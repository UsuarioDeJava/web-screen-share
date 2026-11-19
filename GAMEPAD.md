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
Os valores são da **saída mapeada** enviada ao jogo. **Editar mapeamento, inversões
e zona morta** expande os ajustes.

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

## Ajustes rápidos e vibração local

LT/L2 e RT/R2 mostram entrada e saída em porcentagem. O limite independente de cada
um escala a pressão recebida: limite 50% e aperto completo produzem 0,5 (128 de 255
no XInput); aperto de 50% com esse limite produz 0,25. O padrão continua 100%.
Os limites também se aplicam a botões extras associados aos gatilhos e são salvos
por controle. Trocar o preset preserva os limites; restaurar o preset retorna a 100%.
Se o hardware só informar 0 ou 1, o app não consegue medir a posição intermediária:
confira o modo de conexão, a trava e a configuração analógica no software do fabricante.

O teste de vibração dura um segundo, com intensidade ajustável e botão Parar.
Usa o atuador disponível na Gamepad API (dual-rumble ou pulse); controles e modos
sem suporte mostram a indisponibilidade. Fechar o painel, trocar o controle ou perder
foco interrompe o efeito. Este é um teste local, sem retorno de vibração dos jogos
remotos. Mapeamento numérico e leituras técnicas ficam recolhidos nas opções avançadas.
