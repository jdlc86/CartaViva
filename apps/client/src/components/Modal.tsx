import {useEffect,useId,useRef,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {Icon} from './Icon';

export function Modal({title,onClose,children,labelledBy,closeLabel='Cerrar'}:Readonly<{
 title:string;onClose:()=>void;children:ReactNode;labelledBy?:string;closeLabel?:string;
}>){
 const closeRef=useRef<HTMLButtonElement>(null);
 const dialogRef=useRef<HTMLElement>(null);
 const generatedId=useId();
 const titleId=labelledBy??generatedId;
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  closeRef.current?.focus();
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){onClose();return;}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('keydown',onKey);previous?.focus();};
 },[onClose]);
 const trapFocus=(event:ReactKeyboardEvent<HTMLElement>)=>{
  if(event.key!=='Tab')return;
  const focusable=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
  if(!focusable?.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(focusable.length===1||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){
   event.preventDefault();(event.shiftKey?last:first).focus();
  }
 };
 return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section ref={dialogRef} className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapFocus}>
   <div className="modal-heading"><h2 id={titleId}>{title}</h2><button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}><Icon name="close"/></button></div>
   {children}
  </section>
 </div>;
}
