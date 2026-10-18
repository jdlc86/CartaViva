/**
 * Sabora domain kernel — no timers, network or database reads.
 * Integrate with a transactional repository and a durable event outbox.
 * This module is not a deployed order API.
 */
export const Availability = Object.freeze({ AVAILABLE:"available", SOLD_OUT:"sold_out", RETIRED:"retired" });
export class DomainConflict extends Error { constructor(code, detail){super(detail);this.name="DomainConflict";this.code=code;} }
export function visibleCatalog(categories, dishes) {
  const published = dishes.filter(d=>d.published===true && d.availability!==Availability.RETIRED);
  return categories.filter(c=>c.published===true && published.some(d=>d.categoryId===c.id))
    .sort((a,b)=>a.position-b.position)
    .map(c=>({...c,dishes:published.filter(d=>d.categoryId===c.id)}));
}
/** Resolve original selections against an authoritative catalog snapshot. */
export function detectIncidents(lines, catalog) {
  const issues=[];
  for(const line of lines){
    const dish=catalog.dishes.get(line.dishId);
    if(!dish||!dish.published||dish.availability!==Availability.AVAILABLE)
      issues.push({lineId:line.id,kind:"dish_unavailable",itemId:line.dishId});
    for(const optionId of line.optionIds??[]){
      const option=catalog.options.get(optionId);
      if(!option||!option.published||option.availability!==Availability.AVAILABLE)
        issues.push({lineId:line.id,kind:"option_unavailable",itemId:optionId});
    }
  }
  return issues;
}
export function confirmBasket({lines,catalog,acceptedCatalogVersion}){
  if(acceptedCatalogVersion!==catalog.version) throw new DomainConflict("catalog_changed","Revisar cambios del catálogo");
  const incidents=detectIncidents(lines,catalog);
  if(incidents.length)throw new DomainConflict("unavailable_selection",JSON.stringify(incidents));
  return {status:"validated",lines:structuredClone(lines)};
}
/**
 * Pure transition for an already-confirmed order still waiting for table grouping.
 * Caller MUST atomically compare-and-swap old status/version, persist replacement,
 * cancel scheduled dispatch and write an outbox event in one DB transaction.
 * Dispatch replacement immediately after commit with idempotency key.
 */
export function prepareImmediateResubmission({original,correctedLines,catalog,acceptedCatalogVersion,idempotencyKey}){
  if(original.status!=="awaiting_group_dispatch")throw new DomainConflict("already_dispatched","La comanda ya no está en espera");
  if(!idempotencyKey)throw new DomainConflict("idempotency_required","Falta clave de idempotencia");
  confirmBasket({lines:correctedLines,catalog,acceptedCatalogVersion});
  return {
    replacesOrderId:original.id,expectedOrderVersion:original.version,
    status:"dispatch_immediately",bypassTableGrouping:true,
    idempotencyKey,lines:structuredClone(correctedLines),
    originalSnapshot:structuredClone(original.lines)
  };
}
/** Push is opt-in; in-app incident visibility is mandatory. */
export function incidentDelivery({affectedCustomerIds,subscribedCustomerIds,event}){
  const subscribers=new Set(subscribedCustomerIds);
  return [...new Set(affectedCustomerIds)].map(customerId=>({
    customerId,inApp:event,push:subscribers.has(customerId)?event:null
  }));
}
