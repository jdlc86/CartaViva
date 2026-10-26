import {memo} from 'react';
import {formatPrice,type MenuItem} from '../catalog';
import {Icon} from './Icon';

export const ProductCard=memo(function ProductCard({item,quantity,favorite,locale,onFavorite,onDetail,onChange}:Readonly<{
 item:MenuItem;quantity:number;favorite:boolean;locale:'es'|'en';
 onFavorite:(id:string)=>void;onDetail:(item:MenuItem)=>void;onChange:(item:MenuItem,delta:number)=>void;
}>){
 const es=locale==='es';
 return <article className={`product-card${item.available?'':' sold-out'}`} data-testid="product-card">
  <div className="product-visual" aria-label={es?'Imagen del plato pendiente de activo autorizado':'Dish image awaiting an approved asset'}>
   <Icon name="leaf"/><span>{es?'Imagen pendiente':'Image pending'}</span>
   {!item.available?<strong className="sold-out-badge">{es?'Agotado':'Sold out'}</strong>:null}
  </div>
  <div className="product-body">
   <div className="product-meta"><span>{item.category}</span><button className={`favorite-button${favorite?' active':''}`} type="button" aria-pressed={favorite} aria-label={`${favorite?(es?'Quitar de favoritos':'Remove from favorites'):(es?'Añadir a favoritos':'Add to favorites')}: ${item.name}`} onClick={()=>onFavorite(item.id)}><Icon name="heart"/></button></div>
   <h3>{item.name}</h3>
   <p className="allergen-summary">{item.allergens.length?(es?'Alérgenos declarados: ':'Declared allergens: ')+item.allergens.join(', '):(es?'Sin alérgenos declarados. Consulta posibles trazas.':'No declared allergens. Ask about possible traces.')}</p>
   <div className="product-price">{formatPrice(item.priceCents,es?'es-ES':'en-IE')}</div>
   <button className="detail-link" type="button" onClick={()=>onDetail(item)}>{es?'Ver detalle':'View details'} <Icon name="arrow"/></button>
   {item.available?(quantity===0?<button className="add-button" type="button" onClick={()=>onChange(item,1)}><Icon name="plus"/>{es?'Añadir':'Add'}</button>:
    <div className="quantity-control" aria-label={`${es?'Cantidad':'Quantity'}: ${item.name}`}>
     <button type="button" onClick={()=>onChange(item,-1)} aria-label={`${es?'Quitar una unidad de':'Remove one unit of'} ${item.name}`}><Icon name="minus"/></button>
     <strong aria-live="polite">{quantity}</strong>
     <button type="button" onClick={()=>onChange(item,1)} aria-label={`${es?'Añadir una unidad de':'Add one unit of'} ${item.name}`}><Icon name="plus"/></button>
    </div>):<button className="add-button" type="button" disabled>{es?'No disponible':'Unavailable'}</button>}
  </div>
 </article>;
});
