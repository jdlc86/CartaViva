import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export function startPublishedClientPwa(options){
 return startPublishedPwa('client',options);
}

export function startPublishedManagementPwa(options){
 return startPublishedPwa('management',options);
}

async function startPublishedPwa(name,{apiOrigin,port=0,tls=false}){
 if(process.env.GITHUB_ACTIONS!=='true'||!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(apiOrigin))
  throw Error('disposable_published_pwa_fixture_required');
 const app=new URL('../../apps/'+name+'/',import.meta.url);
 const require=createRequire(new URL('package.json',app));
 const {build,preview}=await import(pathToFileURL(require.resolve('vite')).href);
 const directory=await mkdtemp(join(tmpdir(),'sabora-published-'+name+'-'));
 const outDir=join(directory,'dist');
 const config={root:fileURLToPath(app),mode:'production',logLevel:'error',build:{outDir},
  define:{'import.meta.env.VITE_SABORA_OPERATIONAL_PWA':JSON.stringify('1'),
   'import.meta.env.VITE_SABORA_RESTAURANT_CODE':JSON.stringify('SABORA')}};
 try{
  let https;
  if(tls){
   const key=join(directory,'key.pem'),cert=join(directory,'cert.pem');
   execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-subj','/CN=Sabora disposable PWA','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost',
    '-keyout',key,'-out',cert],{stdio:'ignore',timeout:15000});
   https={key:await readFile(key),cert:await readFile(cert)};
  }
  await build(config);
  const server=await preview({...config,preview:{host:'127.0.0.1',port,https,strictPort:true,
   proxy:{'/api':{target:apiOrigin,changeOrigin:false}}}});
  return {httpServer:server.httpServer,async close(){
   try{await server.close();}finally{await rm(directory,{recursive:true,force:true});}
  }};
 }catch(error){
  await rm(directory,{recursive:true,force:true});
  throw error;
 }
}
