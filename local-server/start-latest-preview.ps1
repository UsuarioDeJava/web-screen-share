param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
try {
    $projectDirectory = Split-Path $PSScriptRoot -Parent
    $previewDirectories = Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'desktop\dist') -Directory |
        Where-Object { $_.Name -match '^gamepad-preview(?:-\d+)?$' } |
        Sort-Object { if ($_.Name -match '-(\d+)$') { [int]$Matches[1] } else { 1 } } -Descending
    $applicationPath = $null
    foreach ($directory in $previewDirectories) {
        $candidate = Join-Path $directory.FullName 'win-unpacked\Web Screen Share.exe'
        $archive = Join-Path $directory.FullName 'win-unpacked\resources\app.asar'
        if ((Test-Path -LiteralPath $candidate) -and (Test-Path -LiteralPath $archive)) {
            $applicationPath = $candidate
            break
        }
    }
    if (-not $applicationPath) { throw 'Nenhuma versão de teste pronta foi encontrada em desktop\dist.' }
    $profileDirectory = Join-Path $PSScriptRoot 'desktop-profile'
    if ($CheckOnly) {
        [PSCustomObject]@{ Application = $applicationPath; Server = 'https://localhost:3100'; Profile = $profileDirectory }
        return
    }
    $env:WSS_SERVER = 'https://localhost:3100'
    $env:WSS_USER_DATA = $profileDirectory
    # Reutiliza o servidor de teste e o mesmo perfil das versões anteriores.
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        # Windows PowerShell converte stderr nativo em ErrorRecord. O Docker
        # também escreve progresso em stderr mesmo quando termina com sucesso.
        $ErrorActionPreference = 'Continue'
        $dockerOutput = & docker compose -f (Join-Path $PSScriptRoot 'compose.yaml') up -d --no-build 2>&1
        $dockerExitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($dockerExitCode -ne 0) {
            throw "Não foi possível iniciar o servidor de teste. Abra o Docker Desktop e tente novamente.`n$($dockerOutput -join [Environment]::NewLine)"
        }
    }
    Start-Process -FilePath $applicationPath -WorkingDirectory $projectDirectory -WindowStyle Normal
} catch {
    if ($CheckOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Web Screen Share - versão de teste') | Out-Null
    exit 1
}
