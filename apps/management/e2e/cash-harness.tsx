import {createRoot} from 'react-dom/client';
import {ManagementApp} from '../src/main';
import type {EconomicAccount,OrderOperationsGateway} from '../src/order-operations-gateway.js';

const tableId='ca610000-0000-4000-8000-000000000001';
const sessionId='ca610000-0000-4000-8000-000000000002';
const externalIntent='ca610000-0000-4000-8000-000000000003';
let accounts:EconomicAccount[]=[
 {accountId:'ca610000-0000-4000-8000-000000000004',tableId,sessionId,customerCode:'SB-23456789ABCD',
  customerAlias:'Marina',paymentTiming:'pay_at_end',grossConsumptionCents:1700,cancelledCents:200,
  netConsumptionCents:1500,stripeCapturedCents:0,stripeRefundedCents:0,stripeNetCents:0,
  outstandingCents:1500,operationalState:'open',settlementIntentId:externalIntent,
  settlementChannel:'external',settlementState:'external_pending',providerConfirmed:false,externalVerified:false},
 {accountId:'ca610000-0000-4000-8000-000000000005',tableId,sessionId,customerCode:'SB-23456789ABCE',
  customerAlias:'Lucía',paymentTiming:'pay_at_end',grossConsumptionCents:2200,cancelledCents:200,
  netConsumptionCents:2000,stripeCapturedCents:2200,stripeRefundedCents:200,stripeNetCents:2000,
  outstandingCents:0,operationalState:'open',settlementIntentId:'ca610000-0000-4000-8000-000000000006',
  settlementChannel:'stripe',settlementState:'stripe_partially_refunded',providerConfirmed:true,externalVerified:false}
];
const calls={verify:0,closeAccount:0,closeTable:0};
Object.assign(window,{__economicCalls:calls});
const gateway={
 async listEconomicAccounts(){return {version:2 as const,
  notice:'Consumo operativo, no recaudación ni facturación acreditada',items:accounts};},
 async verifyExternalSettlement(){calls.verify+=1;accounts=accounts.map(account=>account.settlementIntentId===externalIntent?
  {...account,outstandingCents:0,settlementState:'external_verified',externalVerified:true}:account);return {state:'external_verified'};},
 async closeOperationalAccount({accountId}:{accountId:string}){calls.closeAccount+=1;
  accounts=accounts.map(account=>account.accountId===accountId?{...account,operationalState:'settled'}:account);
  return {state:'settled'};},
 async closeEconomicTable(){calls.closeTable+=1;accounts=accounts.map(account=>({...account,operationalState:'settled'}));
  return {state:'settled'};},
 subscribeEvents(){return ()=>{};}
} as unknown as OrderOperationsGateway;

window.history.replaceState(null,'','#caja');
createRoot(document.getElementById('cash-root')!).render(<ManagementApp operationsGateway={gateway}/>);
