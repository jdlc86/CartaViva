export type StaffMaintenanceResult={version:1;action:'preview'|'recover';eligibleCount:number;blockedCount:number;releasedCount:number;availableCount:number;repeated:boolean};
export type StaffInvitationResult={enrollmentId:string;givenName:string;familyName:string;employeeCode:string;operationalDisplayId:string;currentState:string;repeated:boolean};
export interface StaffManagementGateway{
 invite(input:{email:string;givenName:string;familyName:string;requestedRole:'admin'|'waiter'|'kitchen';correlationId:string}):Promise<StaffInvitationResult>;
 previewCodeMaintenance(input:{correlationId:string}):Promise<StaffMaintenanceResult>;
 recoverCodes(input:{reason:string;confirmed:true;correlationId:string}):Promise<StaffMaintenanceResult>;
}
export class StaffManagementGatewayError extends Error{code:string;details:unknown;}
export function createStaffManagementGateway(input?:{send?:typeof fetch}):StaffManagementGateway;
