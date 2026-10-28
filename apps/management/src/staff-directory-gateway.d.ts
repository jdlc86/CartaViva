export type StaffDirectoryRole='admin'|'waiter'|'kitchen';
export type StaffDirectoryState='invited'|'accepted'|'registered'|'active'|'suspended'|'revoked';
export type StaffDirectoryMember=Readonly<{enrollmentId:string;givenName:string;familyName:string;email:string;operationalDisplayId:string|null;role:StaffDirectoryRole;state:StaffDirectoryState;createdAt:string;updatedAt:string}>;
export type StaffOwnProfile=Readonly<{givenName:string;familyName:string;email:string;operationalDisplayId:string;role:StaffDirectoryRole}>;
export interface StaffDirectoryGateway{
 list(input?:{search?:string|null;cursor?:number;limit?:number}):Promise<Readonly<{version:1;items:ReadonlyArray<StaffDirectoryMember>;nextCursor:number|null}>>;
 detail(enrollmentId:string):Promise<Readonly<{version:1;member:StaffDirectoryMember}>>;
 self():Promise<Readonly<{version:1;profile:StaffOwnProfile}>>;
}
export class StaffDirectoryGatewayError extends Error{code:string;}
export function createStaffDirectoryGateway(input?:{send?:typeof fetch}):StaffDirectoryGateway;
