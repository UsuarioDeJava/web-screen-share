const path=require('node:path'),{execFileSync}=require('node:child_process');
function build(context){
  const platform=context?.electronPlatformName||process.platform;if(platform!=='win32')return;
  if(context?.arch!==undefined&&context.arch!==1&&context.arch!=='x64')return;
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'../scripts/build-wgc-encode-probe.ps1'),'-OutputDirectory',path.join(__dirname,'native/bin'),'-Application'],{windowsHide:true,stdio:'inherit'});
}
module.exports=build;if(require.main===module)build();
