export function createH6CustomerPaymentFlow({flow,payments}={}){
 if(!flow||typeof flow.authorizeVisit!=='function'||typeof flow.quote!=='function'||
    typeof flow.confirm!=='function'||!payments||typeof payments.authorize!=='function'||
    (typeof flow.resubmitOrderRevision==='function'&&typeof payments.captureOrDispatch!=='function'))
  throw Error('invalid_h6_customer_payment_flow');
 return Object.freeze({
  authorizeVisit:flow.authorizeVisit,
  quote:flow.quote,
  ...(typeof flow.readPaymentPolicy==='function'?{readPaymentPolicy:flow.readPaymentPolicy}:null),
  ...(typeof flow.lookupConfirmation==='function'?{lookupConfirmation:flow.lookupConfirmation}:null),
  ...(typeof flow.readOrderRevision==='function'?{readOrderRevision:flow.readOrderRevision}:null),
  async confirm(input){
   const result=await flow.confirm(input);
   if(result.status==='acceptance_required'||result.paymentMode!=='pay_now'||
      result.roundState!=='awaiting_authorization')return result;
   if(!result.authorizationKey||!result.paymentAttemptId)throw Error('invalid_h6_payment_state');
   const payment=await payments.authorize({orderId:result.orderId,amountCents:result.amountCents,
    authorizationKey:result.authorizationKey});
   return Object.freeze({...result,roundState:payment.round_state,
    paymentState:payment.payment_state,...(payment.clientSecret?{clientSecret:payment.clientSecret}:null)});
  },
  ...(typeof flow.resubmitOrderRevision==='function'?{async resubmitOrderRevision(input){
   const result=await flow.resubmitOrderRevision(input);
   if(result.status==='acceptance_required'||result.captureRequired!==true)return result;
   const payment=await payments.captureOrDispatch({orderId:result.orderId,serverDue:true});
   return Object.freeze({...result,
    ...(typeof payment.round_state==='string'?{state:payment.round_state}:null),
    ...(typeof payment.dispatch_state==='string'?{dispatchState:payment.dispatch_state}:null)});
  }}:null)
 });
}
