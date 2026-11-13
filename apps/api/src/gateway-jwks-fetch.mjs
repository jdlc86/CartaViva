import https from 'node:https';
import tls from 'node:tls';

const HOST=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INTERNAL=/^[a-z][a-z0-9-]{0,62}$/;
const fail=()=>Error('gateway_jwks_unavailable');

export function createGatewayJwksFetch({issuer,connectHost,connectPort,
 requestImpl=https.request,tlsConnect=tls.connect}={}){
 let base;
 try{base=new URL(issuer);}catch{throw fail();}
 if(base.protocol!=='https:'||base.pathname!=='/auth/v1'||base.search||base.hash||
    !HOST.test(base.hostname)||typeof connectHost!=='string'||
    !(HOST.test(connectHost)||INTERNAL.test(connectHost))||
    !Number.isSafeInteger(connectPort)||connectPort<1||connectPort>65535||
    typeof requestImpl!=='function'||typeof tlsConnect!=='function')throw fail();
 const endpoint=base.origin+'/auth/v1/.well-known/jwks.json';
 class ExactGatewayAgent extends https.Agent{
  createConnection(_options,callback){
   return tlsConnect({host:connectHost,port:connectPort,servername:base.hostname,
    rejectUnauthorized:true,ALPNProtocols:['http/1.1'],minVersion:'TLSv1.2'},callback);
  }
 }
 const agent=new ExactGatewayAgent({keepAlive:false,maxSockets:2,maxFreeSockets:0});
 return async function gatewayFetch(url,options={}){
  if(url!==endpoint||options.method!=='GET'||options.redirect!=='error')throw fail();
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=error=>{if(!settled){settled=true;agent.destroy();reject(error??fail());}};
   let request;
   try{
    request=requestImpl({protocol:'https:',hostname:base.hostname,port:443,
     path:'/auth/v1/.well-known/jwks.json',method:'GET',agent,signal:options.signal,
     headers:{accept:'application/json',host:base.hostname}},response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
       bytes+=chunk.length;if(bytes>65536){response.destroy();finish();return;}chunks.push(chunk);
      });
      response.once('error',()=>finish());
      response.once('end',()=>{
       if(settled)return;settled=true;
       const body=Buffer.concat(chunks).toString('utf8');
       resolve(Object.freeze({ok:response.statusCode===200,status:response.statusCode,
        headers:Object.freeze({get:name=>{
         const value=response.headers?.[String(name).toLowerCase()];
         return Array.isArray(value)?value.join(', '):value??null;
        }}),text:async()=>body}));
      });
    });
    request.once('error',()=>finish());request.end();
   }catch{request?.destroy();finish();}
  });
 };
}
