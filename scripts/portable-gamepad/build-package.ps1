$ErrorActionPreference = 'Stop'
$project = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$output = Join-Path $project 'desktop/dist/pacote-gamepad-amigo'
$components = Join-Path $output 'componentes'
New-Item -ItemType Directory -Force -Path $components | Out-Null
$application = 'Web-Screen-Share-Portable-1.5.0-gamepad-test.exe'
Copy-Item -LiteralPath (Join-Path $project "desktop/dist/gamepad-portable/$application") -Destination (Join-Path $output $application) -Force
foreach ($name in 'INICIAR.cmd','iniciar.ps1') { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $output $name) -Force }
$downloads = @(
    @{ Name='ViGEmBus_1.22.0_x64_x86_arm64.exe'; Url='https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe'; Hash='89220A7865076B342892F98865F3499FB7C4CFD673159E89D352C360FD014C6A' },
    @{ Name='ViGEmClient.dll'; Url='https://raw.githubusercontent.com/nefarius/ViGEm.NET/2197a9a6200a1cc4cbefc19e4ef6c9bbb63ff567/ViGEmClient/costura64/ViGEmClient.dll'; Hash='5FD323A2DDB39E2966D55EB595B782BA1A5E71B01DB07B3A780D9B242FE6DACE' }
)
foreach ($item in $downloads) {
    $destination = Join-Path $components $item.Name
    if (-not (Test-Path -LiteralPath $destination)) { Invoke-WebRequest -UseBasicParsing -Uri $item.Url -OutFile $destination }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $item.Hash) { throw "SHA256 incorreto: $($item.Name)" }
}
$signature = Get-AuthenticodeSignature -LiteralPath (Join-Path $components $downloads[0].Name)
if ($signature.Status -ne 'Valid') { throw "Assinatura do driver invalida: $($signature.Status)" }
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/nefarius/ViGEmBus/master/LICENSE' -OutFile (Join-Path $components 'LICENSE-ViGEmBus.txt')
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/nefarius/ViGEmClient/master/LICENSE' -OutFile (Join-Path $components 'LICENSE-ViGEmClient.txt')
Copy-Item -LiteralPath (Join-Path $project 'LICENSE') -Destination (Join-Path $output 'LICENSE-Web-Screen-Share.txt') -Force
$files = foreach ($name in $application, 'componentes/ViGEmBus_1.22.0_x64_x86_arm64.exe', 'componentes/ViGEmClient.dll') {
    @{ name=$name; sha256=(Get-FileHash -LiteralPath (Join-Path $output $name) -Algorithm SHA256).Hash }
}
@{ version='1.5.0-gamepad-test'; commit='2d57ef2'; application=$application; server='https://paolinho-pc.tail1ae8a1.ts.net/'; files=@($files); sources=$downloads } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $output 'pacote.json') -Encoding UTF8
@'
WEB SCREEN SHARE - TESTE DE GAMEPAD - WINDOWS X64

1. Extraia o ZIP inteiro para uma pasta sua (por exemplo, na Area de Trabalho).
2. Conecte o Tailscale a VPN do grupo.
3. Execute INICIAR.cmd. Use sempre esse iniciador, inclusive nos proximos testes.
4. Se o ViGEmBus estiver ausente, o instalador oficial sera executado. Confirme o
   pedido de administrador e aguarde a instalacao automatica. Se solicitado, reinicie o
   Windows e execute INICIAR.cmd novamente.
5. O app abre com o servidor do Tailscale configurado. Escolha seu nick.
6. Para receber os comandos do amigo: transmita a tela inteira pelo app, mantenha
   as marcacoes habilitadas e abra Configuracoes > Ponteiro e controle.
   Em Controle remoto, marque Gamepad ao lado do nome dele e clique em Permitir.
7. O amigo autorizado deve clicar no botao de controle na sua transmissao e manter
   a janela dele em primeiro plano para enviar os comandos do controle fisico.

A DLL e copiada automaticamente para perfil/gamepad/x64/ViGEmClient.dll.
O perfil e exclusivo deste pacote; nao inclui dados pessoais do autor.
O app roda como usuario normal; somente o instalador pede administrador.
O driver e instalado no Windows e permanece instalado apos fechar o aplicativo.
O instalador do ViGEmBus e assinado pelo fabricante. O app e o iniciador nao sao
assinados e podem exibir aviso do Windows.
Os componentes estao incluidos: nao e preciso baixa-los durante a preparacao.
A conexao com a sala precisa de internet, Tailscale e permissao na VPN.
O anfitriao deve manter o PC e o container ligados.
Ctrl+Shift+X no PC que recebe os comandos revoga as permissoes.
Vibracao E/D e um teste local; vibracao de jogos remotos nao e transmitida.

Versao 1.5.0-gamepad-test, commit 2d57ef2, branch codex/gamepad-sharing.
Fontes e hashes: pacote.json. Licencas dos componentes: pasta componentes.
'@ | Set-Content -LiteralPath (Join-Path $output 'LEIA-ME.txt') -Encoding UTF8
& (Join-Path $output 'iniciar.ps1') -CheckOnly
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Validacao do iniciador falhou.' }
$zip = Join-Path $project 'desktop/dist/Web-Screen-Share-Gamepad-Amigo.zip'
$payload = foreach ($name in $application,'componentes','INICIAR.cmd','iniciar.ps1','LEIA-ME.txt','LICENSE-Web-Screen-Share.txt','pacote.json') { Join-Path $output $name }
Compress-Archive -Path $payload -DestinationPath $zip -Force -CompressionLevel Fastest
Get-Item -LiteralPath $zip | Select-Object FullName,Length
