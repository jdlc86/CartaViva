import {useCallback,useEffect,useRef,useState} from 'react';
import {Icon} from './Icon';

type BarcodeDetectorResult=Readonly<{rawValue?:string}>;
type BarcodeDetectorLike={detect(source:HTMLVideoElement):Promise<readonly BarcodeDetectorResult[]>};
type BarcodeDetectorConstructor=new (options:{formats:readonly string[]})=>BarcodeDetectorLike;
type ScannerState='idle'|'starting'|'scanning'|'unsupported'|'denied'|'failed';

const detectorConstructor=()=>Reflect.get(globalThis,'BarcodeDetector') as BarcodeDetectorConstructor|undefined;

export function TableQrScanner({locale,disabled=false,onScan}:Readonly<{
 locale:'es'|'en';disabled?:boolean;onScan:(payload:string)=>void;
}>){
 const [state,setState]=useState<ScannerState>('idle');
 const videoRef=useRef<HTMLVideoElement>(null);
 const streamRef=useRef<MediaStream|null>(null);
 const frameRef=useRef<number|null>(null);
 const activeRef=useRef(false);

 const stop=useCallback(()=>{
  activeRef.current=false;
  if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
  frameRef.current=null;
  for(const track of streamRef.current?.getTracks()??[])track.stop();
  streamRef.current=null;
  if(videoRef.current)videoRef.current.srcObject=null;
 },[]);
 useEffect(()=>()=>stop(),[stop]);

 const start=useCallback(async()=>{
  if(disabled||activeRef.current)return;
  const Detector=detectorConstructor();
  if(!Detector||!navigator.mediaDevices?.getUserMedia){setState('unsupported');return;}
  setState('starting');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:false,
    video:{facingMode:{ideal:'environment'}}});
   streamRef.current=stream;activeRef.current=true;
   const video=videoRef.current;
   if(!video){stop();setState('failed');return;}
   video.srcObject=stream;await video.play();setState('scanning');
   const detector=new Detector({formats:['qr_code']});
   let detecting=false;
   const frame=async()=>{
    if(!activeRef.current)return;
    if(video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA&&!detecting){
     detecting=true;
     try{
      const result=(await detector.detect(video)).find(item=>typeof item.rawValue==='string'&&item.rawValue.length>0);
      if(!activeRef.current)return;
      if(result?.rawValue){const payload=result.rawValue;stop();onScan(payload);return;}
     }catch{stop();setState('failed');return;}
     finally{detecting=false;}
    }
    if(activeRef.current)frameRef.current=requestAnimationFrame(()=>void frame());
   };
   frameRef.current=requestAnimationFrame(()=>void frame());
  }catch(error){
   stop();setState(error instanceof DOMException&&['NotAllowedError','PermissionDeniedError'].includes(error.name)?'denied':'failed');
  }
 },[disabled,onScan,stop]);

 const message=state==='unsupported'?
  (locale==='es'?'Este navegador no ofrece escáner integrado. Abre este QR con la cámara del dispositivo para entrar de forma segura.':'This browser has no integrated scanner. Open the QR with the device camera to enter securely.'):
  state==='denied'?(locale==='es'?'No se concedió acceso a la cámara. Puedes abrir el QR con la cámara del dispositivo.':'Camera access was not granted. You can open the QR with the device camera.'):
  state==='failed'?(locale==='es'?'No se ha podido leer la cámara. Cierra y vuelve a intentarlo o abre el QR con la cámara del dispositivo.':'The camera could not be read. Close and try again, or open the QR with the device camera.'):
  state==='scanning'?(locale==='es'?'Apunta al QR de la mesa. La cámara se detendrá al leerlo.':'Point at the table QR. The camera will stop after reading it.'):
  state==='starting'?(locale==='es'?'Activando la cámara…':'Starting the camera…'):
  (locale==='es'?'La cámara solo se activa cuando tú lo indicas y las imágenes no se envían ni se guardan.':'The camera starts only when you choose, and images are neither sent nor stored.');

 return <div className="qr-scanner">
  <div className={`qr-camera${state==='scanning'?' active':''}`}>
   <video ref={videoRef} muted playsInline aria-label={locale==='es'?'Vista de cámara para escanear el QR':'Camera view for scanning the QR'}/>
   <span aria-hidden="true"><Icon name="qr"/></span>
  </div>
  <p role="status">{message}</p>
  {state==='scanning'?<button type="button" onClick={()=>{stop();setState('idle');}}>{locale==='es'?'Detener cámara':'Stop camera'}</button>:
   <button className="primary-action" type="button" disabled={disabled||state==='starting'} onClick={()=>void start()}>{locale==='es'?'Escanear QR':'Scan QR'}</button>}
 </div>;
}
