import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createStaffDirectoryCoordinator} from './staff-directory-coordinator.mjs';
import {preflightStaffDirectoryIdentity} from './staff-directory-identity-preflight.mjs';
import {createStaffDirectoryRepository} from './staff-directory-repository.mjs';

// Candidate only: validates a dedicated LOGIN and composes the read service.
// It does not register routes, provision credentials or read environment state.
export async function createVerifiedStaffDirectoryFromPool({pool,role,issueCapability}={}){
 if(typeof issueCapability!=='function')throw Error('invalid_staff_directory_composition');
 await preflightStaffDirectoryIdentity({pool,role});
 return createStaffDirectoryCoordinator({withTransaction:createPostgresTransaction({pool}),
  repository:createStaffDirectoryRepository(),issueCapability});
}
