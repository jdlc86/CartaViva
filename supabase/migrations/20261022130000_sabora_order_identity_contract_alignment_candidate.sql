-- Candidate identity parity with the customer profile contract.
-- No runtime privileges, policies, deployment or data backfill.
-- Legacy orders (NULL customer fields) remain valid.
BEGIN;
ALTER TABLE sabora.orders
 DROP CONSTRAINT sabora_order_customer_alias_valid,
 ADD CONSTRAINT sabora_order_customer_alias_valid CHECK (
  customer_alias IS NULL OR (
   length(btrim(customer_alias)) BETWEEN 1 AND 80
   AND customer_alias !~ '[[:cntrl:]]'
  )
 ),
 DROP CONSTRAINT sabora_order_customer_identifier_valid,
 ADD CONSTRAINT sabora_order_customer_identifier_valid CHECK (
  customer_identifier IS NULL OR
  customer_identifier ~ '^SB-[2-9A-HJ-NP-Y]{12}$'
 );
COMMIT;
