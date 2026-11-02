// Staff table-change decisions share the authenticated operations send adapter.
// The host owns JWT acquisition/revocation; this module never stores credentials.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS=new Set(['approved','rejected']);
const ERRORS=new Set(['unauthorized','forbidden','invalid_table_change_decision',
 'table_change_request_not_found','table_change_request_not_pending','table_change_unavailable']);
export class TableChangeDecisionGatewayError extends Error {
 constructor(code,status){super(code);this.name='TableChangeDecisionGatewayError';this.code=code;this.status=status;}
}
export function createTableChangeDecisionGateway({send}={}){
 if(typeof send!=='function')throw Error('invalid_table_change_decision_gateway');
 return Object.freeze({
  async decide({requestId,decision}={}){
   if(typeof requestId!=='string'||!UUID.test(requestId)||!DECISIONS.has(decision))
    throw Error('invalid_table_change_decision');
   let response;
   try{
    response=await send('/api/v1/operations/table-change/decisions',{
     method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
     headers:{Accept:'application/json','Content-Type':'application/json'},
     body:JSON.stringify({requestId,decision})
    });
   }catch{throw new TableChangeDecisionGatewayError('table_change_unavailable',503);}
   if(!response||typeof response.status!=='number'||
    !/^application\/json(?:\s*;|$)/i.test(String(response.headers?.get?.('content-type')??'')))
    throw new TableChangeDecisionGatewayError('table_change_unavailable',503);
   let value;
   try{value=await response.json();}catch{
    throw new TableChangeDecisionGatewayError('table_change_unavailable',503);
   }
   if(!value||typeof value!=='object'||Array.isArray(value))
    throw new TableChangeDecisionGatewayError('table_change_unavailable',503);
   if(!response.ok){
    const code=ERRORS.has(value.error)?value.error:'table_change_unavailable';
    throw new TableChangeDecisionGatewayError(code,response.status);
   }
   if(response.status!==200||value.requestId!==requestId||value.status!==decision||
    Reflect.ownKeys(value).length!==2)
    throw new TableChangeDecisionGatewayError('table_change_unavailable',503);
   return Object.freeze({requestId,status:decision});
  }
 });
}
