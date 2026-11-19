param([switch]$CheckOnly, [switch]$PrepareOnly)

$ErrorActionPreference = 'Stop'
try {
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        throw 'Este pacote exige Windows x64 (Intel ou AMD).'
    }
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pacote.json') -Raw | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        $file = Join-Path $PSScriptRoot $entry.name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo ausente: $($entry.name). Extraia o ZIP inteiro antes de iniciar." }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Arquivo alterado ou incompleto: $($entry.name). Extraia novamente o pacote original." }
    }
    $driver = Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'"
    if ($CheckOnly) {
        [PSCustomObject]@{ Package = $manifest.version; Files = 'SHA256 OK'; Driver = $driver.State; Profile = (Join-Path $PSScriptRoot 'perfil'); Server = $manifest.server }
        return
    }
    if ($driver.State -ne 'Running') {
        if ($PrepareOnly) { throw 'ViGEmBus ainda nao esta ativo. Execute INICIAR.cmd para instalar.' }
        Write-Host 'Instalando o driver de controle virtual. Confirme a solicitacao de administrador do Windows e aguarde.'
        $installer = Join-Path $PSScriptRoot 'componentes/ViGEmBus_1.22.0_x64_x86_arm64.exe'
        if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'Valid') { throw 'A assinatura digital do instalador do driver nao e valida.' }
        # Apenas o instalador recebe elevacao. O aplicativo sera aberto como usuario normal.
        $setup = Start-Process -FilePath $installer -ArgumentList '/quiet','/norestart' -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        if ($setup.ExitCode -in 3010,1641) { throw 'O driver pediu reinicializacao. Reinicie o Windows e execute INICIAR.cmd novamente.' }
        if ($setup.ExitCode -ne 0) { throw "O instalador nao concluiu (codigo $($setup.ExitCode))." }
        $driver = Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'"
        if ($driver.State -ne 'Running') { throw 'O driver ainda nao esta ativo. Reinicie o Windows e execute INICIAR.cmd novamente.' }
    }
    $profile = Join-Path $PSScriptRoot 'perfil'
    $dllDirectory = Join-Path $profile 'gamepad/x64'
    New-Item -ItemType Directory -Force -Path $dllDirectory | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'componentes/ViGEmClient.dll') -Destination (Join-Path $dllDirectory 'ViGEmClient.dll') -Force
    if ($PrepareOnly) { Write-Host 'Driver ativo e DLL preparada no perfil do pacote.'; return }
    $env:WSS_USER_DATA = $profile
    $env:WSS_SERVER = $manifest.server
    Write-Host 'Abrindo o Web Screen Share. Mantenha o Tailscale conectado.'
    Start-Process -FilePath (Join-Path $PSScriptRoot $manifest.application) -WorkingDirectory $PSScriptRoot
} catch {
    Write-Host "Nao foi possivel iniciar: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
