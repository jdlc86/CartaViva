import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';

export function TableQrOneTime({payload,tableNumber}:{payload:string;tableNumber:number}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true;setFailed(false);
  const target=canvas.current;
  if(!target)return;
  void QRCode.toCanvas(target,payload,{errorCorrectionLevel:'M',margin:3,width:280,
   color:{dark:'#17211d',light:'#fffdf8'}}).catch(()=>{if(active)setFailed(true);});
  return()=>{active=false;const context=target.getContext('2d');context?.clearRect(0,0,target.width,target.height);};
 },[payload]);
 if(failed)return <p role="alert">No se pudo representar el QR. Rótalo antes de imprimir.</p>;
 return <figure className="table-qr-one-time">
  <canvas ref={canvas} aria-label={`QR de un solo uso de entrega para la mesa ${tableNumber}`}/>
  <figcaption>Mesa {tableNumber} · Credencial V1 emitida para impresión inmediata</figcaption>
 </figure>;
}
