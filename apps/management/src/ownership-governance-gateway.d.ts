export type OwnershipAction='request'|'offer'|'accept'|'reject'|'cancel'|'force';
export interface OwnershipProposal {id:string;kind:'request'|'offer';fromOwnerId:string;
 toOwnerId:string;status:string;createdAt:string;}
export interface OwnershipNotice {id:string;action:string;previousOwnerId:string|null;
 nextOwnerId:string|null;createdAt:string;}
export interface OwnershipProjection {ownerUserId:string|null;role:'root'|'admin';
 isOwner:boolean;eligibleAdmins:string[];proposals:OwnershipProposal[];
 notifications:OwnershipNotice[];}
export interface OwnershipGovernanceGateway {
 read():Promise<OwnershipProjection>;
 transition(input:{action:OwnershipAction;proposalId?:string|null;
  targetUserId?:string|null;reason?:string|null;requestId?:string}):Promise<{
   ownerUserId:string|null;proposalId:string|null;status:string;replayed:boolean}>;
 revoke():void;
}
export declare class OwnershipGovernanceGatewayError extends Error {
 code:string;status:number;constructor(code:string,status:number);
}
export declare function createAuthenticatedOwnershipGovernanceGateway(options:{
 getAccessToken:()=>Promise<string>;fetchImpl?:typeof fetch;
}):OwnershipGovernanceGateway;
