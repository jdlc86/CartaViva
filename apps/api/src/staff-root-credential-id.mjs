import {createHash} from 'node:crypto';

// Identification only. The provider must verify the actual assertion first.
export function hashRootCredentialId(id){
 if(typeof id!=='string'||id.length<1||id.length>2048||
    !/^[A-Za-z0-9_-]+$/.test(id)||Buffer.from(id,'base64url').toString('base64url')!==id)
  throw Error('invalid_root_credential_id');
 return createHash('sha256').update('sabora.root-credential-id.v1\n'+id,'utf8').digest('hex');
}
