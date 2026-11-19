const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

// Downloads fixos do fabricante. A página não escolhe URLs, caminhos ou comandos.
const ASSETS = [
  { name: 'ViGEmBus_1.22.0_x64_x86_arm64.exe', url: 'https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe', sha256: '89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a' },
  { name: 'ViGEmClient.dll', url: 'https://raw.githubusercontent.com/nefarius/ViGEm.NET/2197a9a6200a1cc4cbefc19e4ef6c9bbb63ff567/ViGEmClient/costura64/ViGEmClient.dll', sha256: '5fd323a2ddb39e2966d55eb595b782ba1a5e71b01db07b3a780d9b242fe6dace' },
];
const LICENSES = [
  ['https://raw.githubusercontent.com/nefarius/ViGEmBus/master/LICENSE', 'LICENSE-ViGEmBus.txt'],
  ['https://raw.githubusercontent.com/nefarius/ViGEmClient/master/LICENSE', 'LICENSE-ViGEmClient.txt'],
];
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download falhou (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 32 * 1024 * 1024) throw new Error('Download excede o tamanho esperado.');
  return bytes;
}
const INSTALL = `
$ErrorActionPreference = 'Stop'
try {
$installer = $env:WSS_GAMEPAD_SETUP
if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'Valid') { throw 'Assinatura digital do driver invalida.' }
$driver = Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'"
if ($driver.State -ne 'Running') {
  try { $setup = Start-Process -FilePath $installer -ArgumentList '/quiet','/norestart' -Verb RunAs -WindowStyle Hidden -Wait -PassThru }
  catch { throw 'Instalacao cancelada ou sem permissao de administrador.' }
  if ($setup.ExitCode -in 3010,1641) { Write-Output 'REBOOT'; exit 0 }
  if ($setup.ExitCode -ne 0) { throw "Instalador terminou com codigo $($setup.ExitCode)." }
  $driver = Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'"
  if ($driver.State -ne 'Running') { Write-Output 'REBOOT'; exit 0 }
}
Write-Output 'READY'
} catch { Write-Output ('FAILED:' + $_.Exception.Message); exit 1 }
`;
async function installDriver(installer) {
  const env = { ...process.env, WSS_GAMEPAD_SETUP: installer };
  // Um app iniciado pelo PowerShell 7 pode herdar módulos incompatíveis com o 5.1.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  let stdout;
  try {
    ({ stdout } = await promisify(execFile)(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(INSTALL, 'utf16le').toString('base64')], {
      env, windowsHide: true, timeout: 600000,
    }));
  } catch (error) {
    throw new Error(error.stdout?.match(/FAILED:(.+)/)?.[1]?.trim() || 'O Windows não concluiu a preparação. Verifique sua conexão e a permissão de administrador.');
  }
  if (!/^(READY|REBOOT)$/m.test(stdout)) throw new Error('O instalador não confirmou o resultado.');
  return { reboot: /^REBOOT$/m.test(stdout) };
}
function createGamepadSetup({ directory, platform = process.platform, arch = process.arch, fetchFile = download, install = installDriver, assets = ASSETS } = {}) {
  let pending = null;
  async function prepare() {
    if (platform !== 'win32' || arch !== 'x64') throw new Error('A instalação automática exige Windows x64 (Intel ou AMD).');
    const setupDirectory = path.join(directory, 'setup');
    await fs.mkdir(setupDirectory, { recursive: true });
    for (const asset of assets) {
      let bytes;
      try { bytes = await fs.readFile(path.join(setupDirectory, asset.name)); } catch {}
      if (!bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) bytes = await fetchFile(asset.url);
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Verificação SHA256 falhou: ${asset.name}.`);
      await fs.writeFile(path.join(setupDirectory, asset.name), bytes);
    }
    for (const [url, name] of LICENSES) await fs.writeFile(path.join(setupDirectory, name), await fetchFile(url));
    const result = await install(path.join(setupDirectory, assets[0].name));
    const dll = await fs.readFile(path.join(setupDirectory, assets[1].name));
    const dllDirectory = path.join(directory, arch);
    await fs.mkdir(dllDirectory, { recursive: true });
    const destination = path.join(dllDirectory, 'ViGEmClient.dll');
    let previous;
    try { previous = await fs.readFile(destination); } catch {}
    // Uma DLL já carregada não pode ser sobrescrita no Windows.
    if (!previous?.equals(dll)) await fs.writeFile(destination, dll);
    return { restartRequired: true, rebootRequired: Boolean(result.reboot), message: result.reboot
      ? 'Componentes preparados. Reinicie o Windows antes de liberar o gamepad.'
      : 'Driver e DLL preparados. Reinicie o aplicativo para habilitar o recebimento de gamepads.' };
  }
  return { prepare() {
    if (!pending) pending = prepare().finally(() => { pending = null; });
    return pending;
  } };
}
module.exports = { createGamepadSetup };
