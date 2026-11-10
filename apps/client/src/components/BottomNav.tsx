import {Icon,type IconName} from './Icon';
export type ClientArea='home'|'information'|'allergens'|'qr'|'favorites'|'settings';
const items:readonly [Exclude<ClientArea,'home'>,IconName,string,string][]=Object.freeze([
 ['information','info','Información','Information'],
 ['allergens','allergens','Alérgenos','Allergens'],
 ['qr','qr','QR','QR'],
 ['favorites','heart','Favoritos','Favorites'],
 ['settings','settings','Ajustes','Settings']
]);
export function BottomNav({locale,active,onSelect}:Readonly<{locale:'es'|'en';active:ClientArea;onSelect:(area:ClientArea)=>void}>){
 return <nav className="bottom-nav" aria-label={locale==='es'?'Navegación cliente':'Customer navigation'}>{items.map(([area,icon,es,en])=><button key={area} type="button" className={`${area==='qr'?'qr-action ':''}${active===area?'active':''}`} aria-current={active===area?'page':undefined} onClick={()=>onSelect(area)}><span className="nav-icon"><Icon name={icon}/></span><span>{locale==='es'?es:en}</span></button>)}</nav>;
}
