export type StaffMaintenanceResult={version:1;action:'preview'|'recover';eligibleCount:number;blockedCount:number;releasedCount:number;availableCount:number;repeated:boolean};
export type StaffInvitationResult={enrollmentId:string;givenName:string;familyName:string;employeeCode:string;operationalDisplayId:string;currentState:string;repeated:boolean};
export interface StaffManagementGateway{
 invite(input:{email:string;givenName:string;familyName:string;requestedRole:'admin'|'waiter'|'kitchen';correlationId:string}):Promise<StaffInvitationResult>;
 previewCodeMaintenance(input:{correlationId:string}):Promise<StaffMaintenanceResult>;
 recoverCodes(input:{reason:string;confirmed:true;correlationId:string}):Promise<StaffMaintenanceResult>;
}
export class StaffManagementGatewayError extends Error{code:string;details:unknown;}
export type StaffRevocationGateway = {
 revokeAccess(input:{enrollmentId:string;reason:string;correlationId:string}):
  Promise<Readonly<{enrollmentId:string;state:'revoked';repeated:boolean}>>;
};
export type StaffLifecycleGateway = Pick<StaffManagementGateway,'invite'>&StaffRevocationGateway&{
 resendInvitation(input:{enrollmentId:string;correlationId:string}):Promise<Readonly<{enrollmentId:string;state:'invited';repeated:boolean}>>;
 activateAccess(input:{enrollmentId:string;correlationId:string}):Promise<Readonly<{enrollmentId:string;state:'active';repeated:boolean}>>;
 suspendAccess(input:{enrollmentId:string;reason:string;correlationId:string}):Promise<Readonly<{enrollmentId:string;state:'suspended';repeated:boolean}>>;
};
export function createStaffManagementGateway(input?:{send?:typeof fetch}):StaffManagementGateway&StaffLifecycleGateway;

export type FirstAdminMember={enrollmentId:string;givenName:string;familyName:string;email:string;operationalDisplayId:string;state:'invited'|'accepted'|'registered'|'active'};
export type FirstAdminState={phase:'empty'|'closed'|'blocked';member:null}|{phase:'current';member:FirstAdminMember};
export type StaffFirstAdminGateway=Pick<StaffLifecycleGateway,'resendInvitation'|'activateAccess'|'revokeAccess'>&{
 read():Promise<FirstAdminState>;
 invite(input:{email:string;givenName:string;familyName:string;correlationId:string}):Promise<Readonly<{enrollmentId:string;state:'invited';repeated:boolean}>>;
};
export function createStaffFirstAdminGateway(input:{send:typeof fetch}):StaffFirstAdminGateway;
