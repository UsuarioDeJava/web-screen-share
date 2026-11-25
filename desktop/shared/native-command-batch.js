// Fronteira do processo principal. Limita antes de percorrer/admitir comandos.
function validBatch(batch, previousId=0) {
  if(!batch||!Number.isSafeInteger(batch.id)||batch.id<1||batch.id<=previousId
    ||!Number.isFinite(batch.at)||!Array.isArray(batch.items)||batch.items.length>32)return false;
  try{return Buffer.byteLength(JSON.stringify(batch))<=16384;}catch{return false;}
}
function fresh(at,now) {return Number.isFinite(at)&&Number.isFinite(now)&&now-at<=100&&at-now<=50;}
function matchesSession(value,expected,allowLegacy=false) {
  return Boolean(value&&(allowLegacy&&!expected ? value.session===undefined||value.session===''
    : typeof value.session==='string'&&value.session===expected));
}
module.exports={validBatch,fresh,matchesSession};
