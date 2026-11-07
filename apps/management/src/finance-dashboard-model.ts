export type FinancePeriod='today'|'last7'|'thisMonth'|'previousMonth';
export type FinanceSnapshot=Readonly<{
 version:1;status:'ready';asOf:string;timeZone:string;period:FinancePeriod;month:string;
 from:string;to:string;salesCents:number;previousSalesCents:number;
 todaySalesCents:number;monthSalesCents:number;
 todayCollectedCents:number|null;monthCollectedCents:number|null;
 ordersCount:number;consumingAccounts:number;averageTicketCents:number|null;
 outstandingCents:number;cashCollectedCents:number;
 stripeCollectedCents:number|null;collectedCents:number|null;
 previousCollectedCents:number|null;tipsCents:null;tipsAvailable:false;
 historicalCoverage:'complete'|'incomplete';rankingComplete:boolean;
 dailySales:ReadonlyArray<Readonly<{date:string;netSalesCents:number}>>;
 topItems:ReadonlyArray<Readonly<{itemId:string;name:string;units:number;netSalesCents:number}>>|null;
}>;
export type FinanceDashboardGateway=Readonly<{
 readFinancialDashboard(options:{period:FinancePeriod;month?:string|null;signal?:AbortSignal}):Promise<FinanceSnapshot>;
}>;
