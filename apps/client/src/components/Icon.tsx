import type {ReactNode,SVGProps} from 'react';

export type IconName='search'|'bag'|'bell'|'info'|'allergens'|'qr'|'heart'|'settings'|'close'|'minus'|'plus'|'leaf'|'arrow';
const paths:Record<IconName,ReactNode>={
 search:<><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></>,
 bag:<><path d="M5.5 8.5h13l-1 12h-11z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></>,
 bell:<><path d="M6 17h12l-1.4-2.2V10a4.6 4.6 0 0 0-9.2 0v4.8z"/><path d="M10 20h4"/></>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/></>,
 allergens:<><path d="M12 21c5-3 7-7 6-12-5 0-9 2-11 7"/><path d="M6 21c0-7 4-11 9-14M5 13c-1-3 0-6 2-9 4 2 6 5 6 8"/></>,
 qr:<><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v6h-6v-2M15 19h2"/></>,
 heart:<path d="M20.5 8.8c0 5.2-8.5 10.2-8.5 10.2S3.5 14 3.5 8.8A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.2Z"/>,
 settings:<><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5L11.5 3h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9L3 9.8l-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2z" transform="translate(2) scale(.83)"/></>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 minus:<path d="M5 12h14"/>,
 plus:<path d="M5 12h14M12 5v14"/>,
 leaf:<><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15Z"/><path d="M6 18c4-4 7-7 12-11"/></>,
 arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>
};

export function Icon({name,...props}:SVGProps<SVGSVGElement>&{name:IconName}){
 return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
