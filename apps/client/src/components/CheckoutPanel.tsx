import {formatPrice} from '../catalog';
import type {Locale} from '../client-state';

export type PaymentMode='pay_now'|'pay_at_end';
export type PaymentChannel='stripe'|'external';
export type CheckoutPhase='quoting'|'ready'|'confirming'|'confirmed'|'payment_action'|'uncertain'|'error';

export function CheckoutPanel({locale,totalCents,phase,paymentMode,paymentChannel,requirePayAsOrdered,fixedPaymentMode=null,policyConflict=false,paymentsEnabled=true,message,
 onPaymentMode,onPaymentChannel,onConfirm,onRetry}:{locale:Locale;totalCents:number;phase:CheckoutPhase;
 paymentMode:PaymentMode;requirePayAsOrdered:boolean;fixedPaymentMode?:PaymentMode|null;
 paymentChannel:PaymentChannel;
 policyConflict?:boolean;paymentsEnabled?:boolean;message:string|null;
 onPaymentMode:(mode:PaymentMode)=>void;onPaymentChannel:(channel:PaymentChannel)=>void;
 onConfirm:()=>void;onRetry:()=>void}){
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
   policyConflict?<p className="honest-status" role="alert">{es?
    'La mesa exige pagar ahora, pero esta cuenta ya tiene fijado «Pagar al terminar». No se puede confirmar un nuevo pedido positivo ni cambiar la modalidad sin intervención y conciliación del personal.':
    'This table now requires immediate payment, but this account is fixed to “Pay at the end”. Ask staff to resolve the conflict; the payment mode cannot be changed here.'}</p>:
   fixedPaymentMode?<div className="honest-status" role="status">
    <strong>{es?'Modalidad ya fijada en tu cuenta: ':'Payment mode fixed for this account: '}
     {fixedPaymentMode==='pay_now'?(es?'Pagar ahora':'Pay now'):(es?'Pagar al terminar':'Pay at the end')}</strong>
    <p>{es?'Se conserva para los siguientes pedidos de esta visita. No es posible cambiarla desde aquí.':
     'It remains in effect for later orders in this visit and cannot be changed here.'}</p>
   </div>:
   <fieldset className="payment-choice"><legend>{es?'¿Cómo quieres pagar?':'How would you like to pay?'}</legend>
    <label><input type="radio" name="payment-mode" checked={paymentMode==='pay_now'}
     onChange={()=>onPaymentMode('pay_now')}/><span><strong>{es?'Pagar ahora':'Pay now'}</strong>
     <small>{es?'Autorización segura ahora; captura al enviar a cocina.':'Secure authorization now; capture on kitchen dispatch.'}</small></span></label>
    <label className={requirePayAsOrdered?'payment-choice--disabled':''}><input type="radio" name="payment-mode"
     checked={paymentMode==='pay_at_end'} disabled={requirePayAsOrdered}
     onChange={()=>onPaymentMode('pay_at_end')}/><span><strong>{es?'Pagar al terminar':'Pay at the end'}</strong>
     <small>{requirePayAsOrdered?(es?'La política de esta mesa exige pagar conforme se pide.':'This table requires payment as ordered.'):
      (es?'Acumula consumo y elige Stripe o caja/terminal externa al liquidar.':'Accumulate consumption and choose Stripe or an external cash desk/terminal at settlement.')}</small></span></label>
   </fieldset>}
  {paymentsEnabled&&!free&&!policyConflict&&(fixedPaymentMode??paymentMode)==='pay_now'?<fieldset className="payment-choice">
   <legend>{es?'¿Dónde se verifica antes de servir?':'Where is it verified before serving?'}</legend>
   <label><input type="radio" name="payment-channel" checked={paymentChannel==='stripe'} onChange={()=>onPaymentChannel('stripe')}/><span><strong>Stripe</strong><small>{es?'Solo se libera tras confirmación real del proveedor.':'Released only after real provider confirmation.'}</small></span></label>
   <label><input type="radio" name="payment-channel" checked={paymentChannel==='external'} onChange={()=>onPaymentChannel('external')}/><span><strong>{es?'Caja o terminal externa':'External cash desk or terminal'}</strong><small>{es?'El camarero comprueba fuera de Sabora y libera; no se registra dinero.':'Staff verifies outside Sabora and releases; no money is recorded.'}</small></span></label>
  </fieldset>:null}
  {message?<p className="honest-status" role="status">{message}</p>:null}
  <button className="primary-action" type="button" disabled={busy||policyConflict} onClick={onConfirm}>
   {phase==='confirming'?(es?'Confirmando…':'Confirming…'):(es?'Confirmar pedido':'Confirm order')}</button>
  <p className="privacy-copy">{paymentsEnabled?(es?'El importe, la política de mesa y la disponibilidad se vuelven a comprobar al confirmar.':'Amount, table policy and availability are checked again on confirmation.'):(es?'La identidad, el QR, el importe y la disponibilidad se vuelven a comprobar al confirmar.':'Identity, QR, amount and availability are checked again on confirmation.')}</p>
 </div>;
}
