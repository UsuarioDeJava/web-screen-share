param([Parameter(Mandatory=$true)][string]$OutputDirectory,[switch]$TestCadence,[switch]$TestPipe,[switch]$Application)
$ErrorActionPreference='Stop'
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$metadata=Join-Path $env:WINDIR 'System32\WinMetadata'
$sources=@('wgc-encode-probe.cs','native-capture-policy.cs','wgc-persistent-probe.cs','wgc-live-capture.cs','native-frame-pipe.cs','frame-cadence.cs','encoder-events.cs','wgc-probe.cs','mft-encoder-probe.cs','d3d11-probe-device.cs','codec-probe-controls.cs','gpu-conversion-probe.cs','mft-texture-encode-probe.cs') | ForEach-Object { Join-Path $PSScriptRoot ('..\desktop\native\'+$_) }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output=Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path 'wgc-encode-probe.exe'
$entry='WgcEncodeProbe'
if ($Application) {
  $output=Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path 'native-video-worker.exe'
  $entry='NativeVideoWorker'
  $sources+=Join-Path $PSScriptRoot '..\desktop\native\native-video-worker.cs'
}
$references=@('System.Runtime.dll','System.Runtime.WindowsRuntime.dll','System.Runtime.InteropServices.WindowsRuntime.dll','System.Web.Extensions.dll') | ForEach-Object { '/reference:'+(Join-Path $framework $_) }
$references+=@('Windows.Foundation.winmd','Windows.Graphics.winmd') | ForEach-Object { '/reference:'+(Join-Path $metadata $_) }
& (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ ('/main:'+$entry) ('/out:'+$output) $references $sources
if ($LASTEXITCODE -ne 0) { throw 'Compilação do probe WGC/encoder falhou.' }
Get-Item -LiteralPath $output | Select-Object FullName,Length
if ($TestCadence) {
  $cadenceOutput=Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path 'frame-cadence-test.exe'
  $cadenceSources=@('frame-cadence.cs','frame-cadence-test.cs') | ForEach-Object { if ($_ -eq 'frame-cadence-test.cs') { Join-Path $PSScriptRoot '..\desktop\test\native\frame-cadence-test.cs' } else { Join-Path $PSScriptRoot ('..\desktop\native\'+$_) } }
  & (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ /main:FrameCadenceTest ('/out:'+$cadenceOutput) $cadenceSources
  if ($LASTEXITCODE -ne 0) { throw 'Compilação do teste de cadência falhou.' }
  & $cadenceOutput
  if ($LASTEXITCODE -ne 0) { throw 'Teste de cadência falhou.' }
}
if ($TestPipe) {
  $pipeOutput=Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path 'native-pipe-fixture.exe'
  $pipeSources=@('native-frame-pipe.cs','native-pipe-fixture.cs') | ForEach-Object { if ($_ -eq 'native-pipe-fixture.cs') { Join-Path $PSScriptRoot '..\desktop\test\native\native-pipe-fixture.cs' } else { Join-Path $PSScriptRoot ('..\desktop\native\'+$_) } }
  & (Join-Path $framework 'csc.exe') /nologo /target:exe /platform:x64 /optimize+ /main:NativePipeFixture ('/out:'+$pipeOutput) ('/reference:'+(Join-Path $framework 'System.Web.Extensions.dll')) $pipeSources
  if ($LASTEXITCODE -ne 0) { throw 'Compilação do fixture IPC nativo falhou.' }
  & node (Join-Path $PSScriptRoot '..\desktop\test\native-pipe-smoke.cjs') $pipeOutput
  if ($LASTEXITCODE -ne 0) { throw 'Teste IPC nativo falhou.' }
}
