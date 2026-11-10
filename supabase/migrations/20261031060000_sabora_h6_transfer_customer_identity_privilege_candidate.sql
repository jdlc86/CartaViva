-- Candidate B2: order ownership verification reads the authenticated customer's public ID.
-- Column-scoped SELECT plus owner-only RLS policy; no customer/staff runtime grants.
BEGIN;
GRANT SELECT(id,public_id) ON sabora.customer_profiles TO sabora_h6_fn_owner;
CREATE POLICY h6_owner_customer_profiles_select ON sabora.customer_profiles
 FOR SELECT TO sabora_h6_fn_owner USING (true);
COMMIT;
