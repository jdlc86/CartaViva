// Sandbox-only opt-in HTTP delivery boundary. Production server.mjs is health-only.
// Preserve EXACT provider bytes: never JSON.parse/reserialize before verifying HMAC.
import {createH6StripeWebhookHandler} from './h6-stripe-webhook.mjs';

const SECRET=/^whsec_[A-Za-z0-9_]{16,}$/;
export function registerH6StripeWebhookHttp(app,{secret,providerRepository,clock=Date.now}={}){
 if(!app||typeof app.register!=='function'||!SECRET.test(secret??'')||
    !providerRepository||typeof providerRepository.ingestWebhook!=='function'||
    typeof clock!=='function')throw Error('invalid_h6_stripe_webhook_http');
 const ingest=createH6StripeWebhookHandler({
  secret,providerRepository,clock,expectedLivemode:false
 });
 // Encapsulated parser cannot alter customer/staff JSON requests.
 app.register(async scoped=>{
  scoped.addContentTypeParser('application/json',{parseAs:'buffer'},(_request,body,done)=>{
   done(null,body);
  });
  scoped.post('/api/v1/provider/stripe/webhook',{bodyLimit:1024*1024},
   async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    reply.header('X-Content-Type-Options','nosniff');
    const rawBody=request.body;
    const signatureHeader=request.headers['stripe-signature'];
    if(!Buffer.isBuffer(rawBody)||typeof signatureHeader!=='string')
     return reply.code(400).send({error:'invalid_stripe_webhook'});
    try{
     await ingest({rawBody,signatureHeader});
    }catch(error){
     if(typeof error?.message==='string'&&error.message.startsWith('invalid_stripe_webhook_'))
      return reply.code(400).send({error:'invalid_stripe_webhook'});
     if(error?.message==='stripe_event_identity_conflict')
      return reply.code(409).send({error:'stripe_webhook_conflict'});
     // Never acknowledge a durable SQL failure; Stripe may retry.
     // Do not log signatures, SQL diagnostics, or provider secrets.
     return reply.code(503).send({error:'stripe_webhook_unavailable'});
    }
    // Only the SQL ledger decides applied/stale/ignored/replay.
    // Never expose account identifiers or outcomes to the webhook caller.
    return reply.code(200).send({received:true});
   });
 });
}
