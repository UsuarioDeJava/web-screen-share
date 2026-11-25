const crypto=require('node:crypto');
// Private session event also wakes an idle encoder; shutdown never needs another AU.
function createStopEvent(){
  const kernel=require('koffi').load('kernel32.dll');
  const create=kernel.func('void* __stdcall CreateEventW(void*, int, int, str16)');
  const set=kernel.func('int __stdcall SetEvent(void*)'),close=kernel.func('int __stdcall CloseHandle(void*)');
  const name='Local\\WSS-Native-Stop-'+crypto.randomUUID(),handle=create(null,1,0,name);
  if(!handle)throw Error('native stop event unavailable');let closed=false;
  return{name,signal(){if(!closed&&!set(handle))throw Error('native stop signal failed');},close(){if(!closed){closed=true;close(handle);}}};
}
module.exports={createStopEvent};
