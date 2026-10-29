#!/usr/bin/env node
// Reviewed registry. Keep one explicit record per migration; automated SQL signals
// remain supplementary and never turn an unreviewed migration into an approval.
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMigrationManifest} from './migration-manifest.mjs';

const defaults={
 postgres:'17',
 idempotency:'single_apply_checksum_guarded',
 reversibility:'forward_fix_or_verified_restore',
 reviewed:true
};
const r=(domain,dependencies,objects,permissions,lockImpact,dataImpact,pgcrypto='none')=>
 ({...defaults,domain,dependencies,objects,permissions,lockImpact,dataImpact,pgcrypto});

export const REVIEWED_MIGRATION_AUDIT={
 '20261020140000_sabora_order_core.sql':r('orders',[],['schema sabora','restaurant_settings','staff_members','dining_tables','orders','order_idempotency'],'FORCE RLS; browser roles revoked','access_exclusive_create','schema only'),
 '20261020150000_sabora_order_transaction.sql':r('orders',['order core'],'confirm_order function','function EXECUTE revoked from public/browser','catalog update on first order','order and idempotency rows'),
 '20261020160000_sabora_qr_rotation.sql':r('tables',['dining_tables'],'rotate_table_qr function','function EXECUTE revoked from public/browser','row lock on one table','QR version/token metadata'),
 '20261020170000_sabora_order_lifecycle.sql':r('orders',['orders','staff_members'],'order_status_events; transition_order_status','FORCE RLS; EXECUTE revoked','table/index creation and row locks','status event rows'),
 '20261020180000_sabora_order_lines_pickup.sql':r('kitchen-sala',['orders','staff_members'],'order_lines; pickup_notifications; order_line_events; triggers/functions','FORCE RLS; EXECUTE revoked','table/index creation and order row locks','line, pickup and event rows'),
 '20261020190000_sabora_staff_access_state.sql':r('staff security',['staff_members','order transition functions'],'staff access columns; active-actor triggers','FORCE RLS retained; EXECUTE revoked','staff table rewrite risk and trigger locks','staff access state'),
 '20261020200000_sabora_staff_reader.sql':r('staff security',['staff_members'],'sabora_staff_reader role; SELECT policy','NOLOGIN NOBYPASSRLS; policy-scoped SELECT','role/policy metadata','none'),
 '20261020210000_sabora_root_admin_owner.sql':r('governance',['staff_members'],'ROOT uniqueness; admin_write_ownership; governance triggers/functions','FORCE RLS; public/browser revoked','unique index scan and governance row locks','ownership singleton and staff state'),
 '20261020220000_sabora_ownership_proposals_audit.sql':r('governance',['admin_write_ownership','staff_members'],'ownership proposals/audit; immutability trigger','FORCE RLS; all runtime direct access revoked','table/index creation','proposal and append-only audit rows'),
 '20261020230000_sabora_ownership_idempotency.sql':r('governance',['admin_ownership_audit'],'idempotency unique constraint','unchanged sealed table ACL','unique validation scan','audit correlation keys'),
 '20261020240000_sabora_ownership_hardening.sql':r('governance',['ownership audit','staff_members'],'not-null hardening; truncate/root guards','public/runtime revoked','constraint validation and trigger metadata','existing governance rows validated'),
 '20261020250000_sabora_dormant_admin_writer.sql':r('governance',[],'sabora_admin_writer role','NOLOGIN NOINHERIT NOBYPASSRLS; zero data grants','role metadata','none'),
 '20261020260000_sabora_writer_future_acl.sql':r('governance',['sabora schema'],'default table/sequence/function ACL','future objects public/browser/writer revoked','default ACL metadata','none'),
 '20261020270000_sabora_default_function_execute.sql':r('governance',[],'global default function ACL for migrator','future PUBLIC EXECUTE revoked','default ACL metadata','none'),
 '20261021010000_sabora_customer_profiles.sql':r('customer identity',['sabora schema'],'customer_profiles','FORCE RLS; public/browser revoked','table creation','profile rows'),
 '20261021020000_sabora_customer_sessions.sql':r('customer identity',['customer_profiles'],'customer_sessions and lookup index','FORCE RLS; public/browser revoked','table/index creation','session hashes/state'),
 '20261021030000_sabora_customer_session_restricted_rpcs.sql':r('customer identity',['profiles','sessions'],'restricted roles, policies and session RPCs','NOLOGIN owners/runtimes; RPC-only EXECUTE','role/policy/function metadata; row locks','session revocation state'),
 '20261021180000_sabora_catalog_publication_foundation.sql':r('catalog',['sabora schema'],'catalog_items','FORCE RLS; browser access revoked','table creation','catalog draft/published snapshots'),
 '20261021190000_sabora_catalog_publication_guard.sql':r('catalog',['catalog_items'],'catalog validation/publication functions','PUBLIC EXECUTE revoked','catalog row locks','published snapshot changes'),
 '20261021200000_sabora_catalog_reader.sql':r('catalog',['catalog_items'],'catalog reader/owner roles, policy and read RPC','NOLOGIN NOBYPASSRLS; RPC-only read','role/policy/function metadata','none'),
 '20261021210000_sabora_catalog_economic_candidate.sql':r('catalog economy',['catalog_items'],'money/modifier validation functions and constraints','PUBLIC EXECUTE revoked','constraint validation on catalog','economic snapshot validation'),
 '20261021220000_sabora_catalog_quote_ledger_candidate.sql':r('catalog economy',['catalog_items','customer profiles'],'displayed quote and confirmation ledgers','FORCE RLS; direct runtime access revoked','table/index creation','append-only quote/attempt rows'),
 '20261021230000_sabora_catalog_ledger_append_only_candidate.sql':r('catalog economy',['quote ledgers'],'append-only/truncate guard triggers','mutation rejected independent of role grants','trigger metadata','ledger writes become immutable'),
 '20261021240000_sabora_customer_table_visits_candidate.sql':r('visits',['customer profiles','dining_tables'],'customer_table_visits and indexes','FORCE RLS; browser access revoked','table/index creation','visit authorization rows'),
 '20261021250000_sabora_table_ordering_lifecycle_candidate.sql':r('tables',['dining_tables'],'table ordering lifecycle columns/constraints','existing table ACL retained','access-exclusive ALTER/constraint validation','table operational state'),
 '20261021260000_sabora_table_occupancy_boundary_candidate.sql':r('tables',['table lifecycle'],'occupancy boundary triggers/functions','PUBLIC EXECUTE revoked','table row locks during transitions','session/visit boundaries'),
 '20261021270000_sabora_table_staff_transitions_candidate.sql':r('tables',['table lifecycle','active staff'],'staff table transition function','PUBLIC EXECUTE revoked; active role checked','table row lock','table transition state'),
 '20261021280000_sabora_table_ordering_audit_candidate.sql':r('tables',['table transitions'],'ordering audit table and capture/immutability triggers','FORCE RLS; direct runtime access revoked','table creation and transition trigger','append-only ordering audit'),
 '20261021290000_sabora_table_ordering_audit_truncate_guard_candidate.sql':r('tables',['ordering audit'],'truncate guard trigger','all truncation rejected','trigger metadata','none'),
 '20261022120000_sabora_order_identity_compatibility_candidate.sql':r('orders',['orders','order lines'],'order identity compatibility columns/indexes/constraints','existing FORCE RLS retained','ALTER/constraint validation and index scan','existing order identity rows'),
 '20261022130000_sabora_order_identity_contract_alignment_candidate.sql':r('orders',['order identity compatibility'],'identity alignment constraints','existing FORCE RLS retained','constraint validation','existing orders validated'),
 '20261023010000_sabora_admin_tables_reader_candidate.sql':r('tables',['dining_tables'],'admin table reader role/policy','NOLOGIN NOBYPASSRLS; SELECT-only policy','role/policy metadata','none'),
 '20261023225024_sabora_kitchen_waiter_operations_candidate.sql':r('kitchen-sala',['order lines/events','staff access'],'transition request ledger, audit guards and idempotent function','FORCE RLS; direct access revoked','index validation, table creation and line locks','transition requests/events'),
 '20261024190000_sabora_order_operation_actor_capability_candidate.sql':r('kitchen-sala security',['kitchen/waiter operations','staff governance'],'operation signing keys, sealed owner, RLS policies and HMAC wrapper','NOLOGIN function owner; capability RPC only','extension install plus table/policy/function metadata and row locks','signing keys and authorized operation rows','required'),
 '20261025081318_staff_identity_lifecycle_candidate.sql':r('staff lifecycle',['pgcrypto HMAC','staff governance'],'enrollments, request/audit/key ledgers and lifecycle wrapper','NOLOGIN function owner; FORCE RLS; capability RPC only','large table/policy/function creation and governance row locks','staff enrollment lifecycle, keys and audit','inherited'),
 '20261026120000_sabora_order_operations_read_capability_candidate.sql':r('kitchen-sala reads',['operation HMAC owner','orders/tables/events'],'board/history read capability policies/functions','capability RPC only; durable role revalidated','policy/function metadata and scoped row reads','none','inherited'),
 '20261026222958_sabora_production_customer_flow_candidate.sql':r('customer flow',['profiles/sessions','catalog quotes','visits','orders'],'registration/flow roles, attempt ledgers and visit/quote/order RPCs','separate NOLOGIN owners/runtimes; FORCE RLS; RPC only','large role/table/policy/function creation and transactional row locks','profiles, sessions, visits, quotes, orders and attempts'),
 '20261027072924_sabora_table_qr_payload_v1.sql':r('QR',['dining_tables'],'QR V1 rotation function/constraints','PUBLIC EXECUTE revoked','table row lock','QR version/token digest state'),
 '20261027122858_sabora_h6_events_payments_operations_candidate.sql':r('H6',['pgcrypto','customer flow','orders','staff operations'],'payment/dispatch/incident/refund/cash/outbox/action tables, roles, policies and RPCs','four sealed NOLOGIN roles; FORCE RLS; RPC-only effects','very high: large transactional DDL, constraint/index scans and business row locks','payment, dispatch, incident, refund, cash, webhook and event rows','required'),
 '20261027190334_sabora_pickup_claim_cancel_candidate.sql':r('pickup',['H6 outbox','order operations'],'pickup tasks/events, unique active assignment and management/read RPCs','sealed H6/order owners; FORCE RLS; RPC only','high: backfill/unique index plus task/line locks','pickup state/events and legacy notification compatibility','inherited'),
 '20261027225805_sabora_staff_display_id_candidate.sql':r('staff identity',['staff lifecycle','pickup','pgcrypto HMAC'],'employee code pool/events/requests/maintenance, identity and pickup binding RPCs','sealed identity owner; FORCE RLS; maintenance capability separated','very high: 46,655-row code pool population, indexes, backfill and concurrent allocation locks','employee names/codes, pool, maintenance and pickup display IDs','inherited'),
 '20261028120000_sabora_staff_directory_read_candidate.sql':r('staff directory',['staff identity','pickup','pgcrypto HMAC'],'directory contacts, sealed owner and contextual read/lifecycle RPCs','FORCE RLS; list/detail/self capability scopes; no direct reader access','high: contact backfill/index/constraint validation and directory reads','staff contact/display projections and audit linkage','inherited')
};

export function validateMigrationAudit(manifest,catalog=REVIEWED_MIGRATION_AUDIT){
 const names=new Set(manifest.map(item=>item.name));
 const reviewed=new Set(Object.keys(catalog));
 const missing=[...names].filter(name=>!reviewed.has(name));
 const extra=[...reviewed].filter(name=>!names.has(name));
 if(missing.length||extra.length)throw Error(`migration_audit_coverage_mismatch:missing=${missing.join(',')}:extra=${extra.join(',')}`);
 for(const item of manifest){
  const entry=catalog[item.name];
  for(const key of ['domain','dependencies','objects','permissions','lockImpact','dataImpact','postgres','pgcrypto','idempotency','reversibility'])
   if(entry[key]===undefined||entry[key]==='unverified')throw Error(`migration_audit_incomplete:${item.name}:${key}`);
  if(entry.reviewed!==true)throw Error(`migration_audit_not_reviewed:${item.name}`);
 }
}

export function buildMigrationAudit(root,catalog=REVIEWED_MIGRATION_AUDIT){
 const manifest=buildMigrationManifest(root);
 validateMigrationAudit(manifest,catalog);
 const manifestSha256=createHash('sha256').update(manifest.map(x=>`${x.name}:${x.sha256}`).join('\n')).digest('hex');
 return {schema:1,classification:'reviewed_migration_recovery_inventory',manifestSha256,migrations:manifest.map(item=>({...item,...catalog[item.name]}))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)throw Error('migration_audit_arguments_forbidden');
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
  process.stdout.write(JSON.stringify(buildMigrationAudit(root),null,2)+'\n');
 }catch(error){process.stderr.write('migration_audit_failed:'+error.message+'\n');process.exitCode=1;}
}
