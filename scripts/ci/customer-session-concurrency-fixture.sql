-- CI-only concurrency fixture. Runs on disposable PostgreSQL 17.
-- The two transactions are executed in independent psql processes.
BEGIN;
INSERT INTO sabora.customer_profiles(public_id,alias)
VALUES('SB-WWWWWWWWWWWW','Concurrent CI');
INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
SELECT id,decode(repeat('c4',32),'hex'),now()+interval '1 day'
FROM sabora.customer_profiles WHERE public_id='SB-WWWWWWWWWWWW';
COMMIT;
