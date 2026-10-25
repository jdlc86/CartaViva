// Candidate-only in-process key selection. No key provisioning, persistence or provider.
// A key may encrypt only when active; retired keys can decrypt historical envelopes.
const KEY_ID=/^[A-Za-z0-9_-]{8,64}$/;
function assertKey(key) {
  if (!Buffer.isBuffer(key)||key.length!==32) throw Error('invalid_staff_key_material');
  return Buffer.from(key);
}
export function createStaffInvitationKeyringCandidate({activeKeyId,keys}={}) {
  if (!KEY_ID.test(activeKeyId??'') || !Array.isArray(keys) ||
      keys.length===0 || keys.length>32) throw Error('invalid_staff_keyring_config');
  const entries=new Map();
  for(const entry of keys){
    if (!entry || !KEY_ID.test(entry.id??'') ||
        !['active','decrypt_only','disabled'].includes(entry.state) ||
        entries.has(entry.id)) throw Error('invalid_staff_keyring_config');
    entries.set(entry.id,{state:entry.state,key:assertKey(entry.key)});
  }
  if(entries.get(activeKeyId)?.state!=='active' ||
      [...entries.values()].filter(e=>e.state==='active').length!==1)
    throw Error('invalid_staff_keyring_config');
  let closed=false;
  function assertOpen(){if(closed)throw Error('staff_keyring_closed');}
  return Object.freeze({
    active(){
      assertOpen();
      const entry=entries.get(activeKeyId);
      return Object.freeze({keyId:activeKeyId,key:Buffer.from(entry.key)});
    },
    resolveKey(keyId){
      assertOpen();
      if(!KEY_ID.test(keyId??'')) throw Error('staff_key_unavailable');
      const entry=entries.get(keyId);
      if(!entry||entry.state==='disabled') throw Error('staff_key_unavailable');
      return Buffer.from(entry.key);
    },
    close(){
      if(closed)return;
      closed=true;
      for(const entry of entries.values())entry.key.fill(0);
      entries.clear();
    },
  });
}
