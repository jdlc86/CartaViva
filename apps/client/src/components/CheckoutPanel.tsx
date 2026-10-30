import {formatPrice} from '../catalog';
import type {Locale} from '../client-state';

export type PaymentMode='pay_now'|'pay_at_end';
export type CheckoutPhase='quoting'|'ready'|'confirming'|'confirmed'|'payment_action'|'uncertain'|'error';

export function CheckoutPanel({locale,totalCents,phase,paymentMode,requirePayAsOrdered,paymentsEnabled=true,message,
 onPaymentMode,onConfirm,onRetry}:{locale:Locale;totalCents:number;phase:CheckoutPhase;
 paymentMode:PaymentMode;requirePayAsOrdered:boolean;paymentsEnabled?:boolean;message:string|null;
 onPaymentMode:(mode:PaymentMode)=>void;onConfirm:()=>void;onRetry:()=>void}){
 const es=locale==='es',free=totalCents===0,busy=phase==='quoting'||phase==='confirming';
 if(phase==='quoting')return <div className="checkout-status" role="status"><span/>
  <p>{es?'Revalidando disponibilidad y precio…':'Revalidating availability and price…'}</p></div>;
 if(phase==='confirmed')return <div className="checkout-result checkout-result--success" role="status">
  <strong>{es?'Pedido confirmado':'Order confirmed'}</strong>
  <p>{message??(es?'Puedes seguir su estado desde Notificaciones.':'You can follow its status in Notifications.')}</p></div>;
 if(phase==='payment_action')return <div className="checkout-result" role="alert">
  <strong>{es?'Pago pendiente de completar':'Payment action required'}</strong>
  <p>{message}</p><button type="button" onClick={onRetry}>{es?'Reintentar de forma segura':'Retry safely'}</button></div>;
 if(phase==='uncertain')return <div className="checkout-result" role="alert">
  <strong>{es?'Confirmación pendiente de verificar':'Confirmation needs verification'}</strong>
  <p>{message}</p><button type="button" onClick={onRetry}>{es?'Consultar resultado del pedido':'Check order result'}</button></div>;
 if(phase==='error')return <div className="checkout-result" role="alert">
  <strong>{es?'No se confirmó el pedido':'The order was not confirmed'}</strong>
  <p>{message}</p><button type="button" onClick={onRetry}>{es?'Revisar y reintentar':'Review and retry'}</button></div>;
 return <div className="checkout-panel">
  <div className="checkout-total"><span>{es?'Total confirmado por el servidor':'Server-confirmed total'}</span>
   <strong>{formatPrice(totalCents,es?'es-ES':'en-IE')}</strong></div>
  {!paymentsEnabled?<p className="honest-status">{es?'Este candidato aislado valida pedido, cocina y sala; no activa pagos.':'This isolated candidate validates ordering, kitchen and floor operations; it does not enable payments.'}</p>:free?<p className="honest-status">{es?'Esta ronda es gratuita y no fija modalidad de pago.':'This round is free and does not select a payment mode.'}</p>:
   <fieldset className="payment-choice"><legend>{es?'¿Cómo quieres pagar?':'How would you like to pay?'}</legend>
    <label><input type="radio" name="payment-mode" checked={paymentMode==='pay_now'}
     onChange={()=>onPaymentMode('pay_now')}/><span><strong>{es?'Pagar ahora':'Pay now'}</strong>
     <small>{es?'Autorización segura ahora; captura al enviar a cocina.':'Secure authorization now; capture on kitchen dispatch.'}</small></span></label>
    <label className={requirePayAsOrdered?'payment-choice--disabled':''}><input type="radio" name="payment-mode"
     checked={paymentMode==='pay_at_end'} disabled={requirePayAsOrdered}
     onChange={()=>onPaymentMode('pay_at_end')}/><span><strong>{es?'Pagar al terminar':'Pay at the end'}</strong>
     <small>{requirePayAsOrdered?(es?'La política de esta mesa exige pagar conforme se pide.':'This table requires payment as ordered.'):
      (es?'La cuenta se liquidará presencialmente con el personal.':'The account will be settled in person with staff.')}</small></span></label>
   </fieldset>}
  {message?<p className="honest-status" role="status">{message}</p>:null}
  <button className="primary-action" type="button" disabled={busy} onClick={onConfirm}>
   {phase==='confirming'?(es?'Confirmando…':'Confirming…'):(es?'Confirmar pedido':'Confirm order')}</button>
  <p className="privacy-copy">{paymentsEnabled?(es?'El importe, la política de mesa y la disponibilidad se vuelven a comprobar al confirmar.':'Amount, table policy and availability are checked again on confirmation.'):(es?'La identidad, el QR, el importe y la disponibilidad se vuelven a comprobar al confirmar.':'Identity, QR, amount and availability are checked again on confirmation.')}</p>
 </div>;
}
