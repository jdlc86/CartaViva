export type M5CommunicationSchedule=Readonly<{
 mode:'once'|'daily'|'weekly';
 startDate:string;endDate:string|null;weekdays:readonly number[];
 startTime:string;endTime:string;timeZone:string;
}>;
export type M5CommunicationDraft=Readonly<{
 title:string;body:string;emoji:string;image:string|null;imageLicense:string|null;
 priority:'ALTA'|'BAJA';schedule:M5CommunicationSchedule;
}>;
export type M5CommunicationRecord=Readonly<{
 id:string;state:'draft'|'published'|'paused'|'withdrawn';revision:number;
 draft:M5CommunicationDraft;published:M5CommunicationDraft|null;updatedAt:string;
}>;
export type M5CommunicationsGateway=Readonly<{
 readCommunications():Promise<Readonly<{version:1;items:readonly M5CommunicationRecord[];permissions?:Readonly<{manage:boolean}>}>>;
 manageCommunication(input:Readonly<{
 requestId:string;operation:'save'|'publish'|'pause'|'resume'|'withdraw';
 payload:Readonly<{id:string|null;revision:number|null;draft:M5CommunicationDraft|null}>;
 }>):Promise<Readonly<{id:string;state:string;revision:number;replayed:boolean}>>;
}>;
