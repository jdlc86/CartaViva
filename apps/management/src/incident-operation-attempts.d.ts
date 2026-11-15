export type IncidentOperationKind='report'|'resolve'|'refund';
export type IncidentOperationAttempts=Readonly<{
 pending(kind:IncidentOperationKind,subjectId:string):boolean;
 run<T>(args:{
  kind:IncidentOperationKind;subjectId:string;payload:Readonly<Record<string,unknown>>;
  invoke:(correlationId:string)=>Promise<T>;
  validateResult?:(result:T)=>boolean;
 }):Promise<T>;
}>;
export function createIncidentOperationAttempts(
 options?:{newId?:()=>string}
):IncidentOperationAttempts;
