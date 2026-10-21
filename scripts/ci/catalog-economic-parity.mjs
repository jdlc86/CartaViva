// Shared differential cases: compute the JavaScript oracle and assert PostgreSQL
// returns exactly the same boolean for each candidate economic snapshot.
// Usage: node scripts/ci/catalog-economic-parity.mjs | psql -v ON_ERROR_STOP=1
import {validateEconomicModifiers} from '../../apps/api/src/catalog-economic-modifiers.mjs';

const value={id:'normal',name:'Normal',priceCents:0,available:true,allergens:[]};
const extra={id:'cheese',name:'Queso',priceCents:150,available:true,allergens:['Leche']};
const group={id:'size',name:'Tamaño',required:true,maxSelections:1,values:[value]};
const valid={options:[group],extras:[extra],discount:{type:'percent',basisPoints:1000}};
const cases=[
 ['empty',{}],
 ['valid full',valid],
 ['valid fixed',{...valid,discount:{type:'fixed',amountCents:100}}],
 ['valid 100 percent',{...valid,discount:{type:'percent',basisPoints:10000}}],
 ['valid neutral',{options:[],extras:[],discount:null}],
 ['null options',{...valid,options:null}],
 ['null extras',{...valid,extras:null}],
 ['null discount',{...valid,discount:null}],
 ['missing extra name',{...valid,extras:[{id:'cheese',priceCents:150,available:true,allergens:[]}]}],
 ['null extra name',{...valid,extras:[{...extra,name:null}]}],
 ['number extra id',{...valid,extras:[{...extra,id:42}]}],
 ['negative extra',{...valid,extras:[{...extra,priceCents:-1}]}],
 ['decimal extra',{...valid,extras:[{...extra,priceCents:1.5}]}],
 ['extra unknown key',{...valid,extras:[{...extra,unexpected:true}]}],
 ['duplicate extra',{...valid,extras:[extra,extra]}],
 ['missing group name',{...valid,options:[{id:'size',required:true,maxSelections:1,values:[value]}]}],
 ['null group required',{...valid,options:[{...group,required:null}]}],
 ['duplicate value',{...valid,options:[{...group,values:[value,value]}]}],
 ['oversized selection',{...valid,options:[{...group,maxSelections:2}]}],
 ['empty values',{...valid,options:[{...group,values:[]}]}],
 ['unknown group key',{...valid,options:[{...group,secret:true}]}],
 ['invalid percent',{...valid,discount:{type:'percent',basisPoints:10001}}],
 ['invalid fixed',{...valid,discount:{type:'fixed',amountCents:-1}}],
 ['unknown discount',{...valid,discount:{type:'coupon',amountCents:1}}],
 ['extra allergen null',{...valid,extras:[{...extra,allergens:[null]}]}],
 ['zero price',{...valid,extras:[{...extra,priceCents:0}]}],
 ['max cents',{...valid,extras:[{...extra,priceCents:999999999999999}]}],
 ['over max cents',{...valid,extras:[{...extra,priceCents:1000000000000000}]}],
 ['invalid root',[]]
];
let sql='-- JS-derived expected values checked against PostgreSQL candidate validation.\n';
for(const [name,input] of cases){
 const expected=validateEconomicModifiers(input);
 const json=JSON.stringify(input);
 if(json===undefined)throw Error('unserializable case');
 const escaped=json.replaceAll("'","''");
 const label=name.replaceAll("'","''");
 sql+=`DO $parity$ BEGIN
 IF sabora.validate_catalog_economic_modifiers('${escaped}'::jsonb) IS DISTINCT FROM ${expected?'TRUE':'FALSE'} THEN
  RAISE EXCEPTION 'economic validator parity mismatch: ${label}';
 END IF;
END $parity$;
`;
}
process.stdout.write(sql);
