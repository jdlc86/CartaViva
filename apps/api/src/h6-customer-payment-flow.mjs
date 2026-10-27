export function createH6CustomerPaymentFlow({flow,payments}={}){
 if(!flow||typeof flow.authorizeVisit!=='function'||typeof flow.quote!=='function'||
    typeof flow.confirm!=='function'||!payments||typeof payments.authorize!=='function')
  throw Error('invalid_h6_customer_payment_flow');
 return Object.freeze({
  authorizeVisit:flow.authorizeVisit,
  quote:flow.quote,
  async confirm(input){
   const result=await flow.confirm(input);
   if(result.status==='acceptance_required'||result.paymentMode!=='pay_now'||
      result.roundState!=='awaiting_authorization')return result;
   if(!result.authorizationKey||!result.paymentAttemptId)throw Error('invalid_h6_payment_state');
   const payment=await payments.authorize({orderId:result.orderId,amountCents:result.amountCents,
    authorizationKey:result.authorizationKey});
   return Object.freeze({...result,roundState:payment.round_state,
    paymentState:payment.payment_state,...(payment.clientSecret?{clientSecret:payment.clientSecret}:null)});
  }
 });
}
