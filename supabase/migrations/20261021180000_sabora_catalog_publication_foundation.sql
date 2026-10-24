-- Sabora single-restaurant catalog foundation. No public grants or HTTP routes.
-- Drafts are private; public snapshots are immutable and explicitly published.
CREATE SCHEMA IF NOT EXISTS sabora;
CREATE TABLE IF NOT EXISTS sabora.catalog_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft jsonb NOT NULL DEFAULT '{}'::jsonb,
 draft_revision bigint NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
 published_revision bigint,
 published_snapshot jsonb,
 published_at timestamptz,
 withdrawn_at timestamptz,
 sold_out boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT catalog_publication_consistency CHECK (
   (published_revision IS NULL AND published_snapshot IS NULL AND published_at IS NULL)
   OR (published_revision IS NOT NULL AND published_revision > 0 AND
       published_revision <= draft_revision AND published_snapshot IS NOT NULL AND
       jsonb_typeof(published_snapshot) = 'object' AND published_at IS NOT NULL)
 ),
 CONSTRAINT catalog_draft_object CHECK (jsonb_typeof(draft) = 'object')
);
ALTER TABLE sabora.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.catalog_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.catalog_items FROM PUBLIC, anon, authenticated;
-- No RLS policies intentionally: fail closed for every runtime role.
-- Future publication function must validate price, extras, allergens and
-- discounts, then atomically copy the validated draft to published_snapshot.
-- A withdrawal changes withdrawn_at; sold_out stays visible, but unselectable.
-- No security-definer functions or publication permissions are installed here.
