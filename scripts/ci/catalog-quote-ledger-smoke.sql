-- Disposable PostgreSQL 17 only. All fixtures roll back.
BEGIN;
DO $ledger$
DECLARE
 t1 uuid; t2 uuid; s1 uuid; s2 uuid;
 item1 uuid; item2 uuid; q1 uuid; o1 uuid; o2 uuid; o3 uuid;
 v_constraint text;
BEGIN
 INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash)
 VALUES(901001,4,decode(repeat('11',32),'hex'))
 RETURNING id,session_id INTO t1,s1;
 INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash)
 VALUES(901002,4,decode(repeat('22',32),'hex'))
 RETURNING id,session_id INTO t2,s2;
 INSERT INTO sabora.catalog_items(draft) VALUES('{}'::jsonb) RETURNING id INTO item1;
 INSERT INTO sabora.catalog_items(draft) VALUES('{}'::jsonb) RETURNING id INTO item2;
 INSERT INTO sabora.orders(table_id,session_id,company,employee_number,confirmed_at,grouping,items)
 VALUES(t1,s1,'CI','test',now(),'first','[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id INTO o1;
 INSERT INTO sabora.orders(table_id,session_id,company,employee_number,confirmed_at,grouping,items)
 VALUES(t2,s2,'CI','test',now(),'first','[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id INTO o2;
 INSERT INTO sabora.orders(table_id,session_id,company,employee_number,confirmed_at,grouping,items)
 VALUES(t1,s1,'CI','test',now(),'grouped','[{"category":"main","name":"CI","quantity":1}]'::jsonb)
 RETURNING id INTO o3;
 INSERT INTO sabora.catalog_displayed_quotes(
  table_id,session_id,visit_id,basket_id,actor_id,item_id,
  published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
 VALUES(t1,s1,'visit-1','basket-1','actor-1',item1,
  1,1000,100,900,'{}'::jsonb,now()+interval '5 minutes')
 RETURNING id INTO q1;
 INSERT INTO sabora.catalog_confirmation_attempts(
  table_id,session_id,visit_id,basket_id,actor_id,item_id,
  request_key,request_fingerprint,quote_id,economic_evidence,order_id)
 VALUES(t1,s1,'visit-1','basket-1','actor-1',item1,
  'request-001','hash-1',q1,'{}'::jsonb,o1);

 -- Same request key in same visit/cesta/actor must be unique.
 BEGIN
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES(t1,s1,'visit-1','basket-1','actor-1',item1,
   'request-001','hash-2',q1,'{}'::jsonb,o2);
  RAISE EXCEPTION 'duplicate request accepted';
 EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_confirmation_idempotency' THEN
   RAISE EXCEPTION 'unexpected duplicate constraint %',v_constraint;
  END IF;
 END;

 -- The quote must refer to exactly the same item.
 BEGIN
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES(t1,s1,'visit-1','basket-1','actor-1',item2,
   'request-002','hash-2',q1,'{}'::jsonb,o3);
  RAISE EXCEPTION 'cross-item quote accepted';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_confirmation_quote_scope' THEN
   RAISE EXCEPTION 'unexpected cross-item constraint %',v_constraint;
  END IF;
 END;

 -- A quote for a different visit cannot be reused.
 BEGIN
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES(t1,s1,'visit-2','basket-1','actor-1',item1,
   'request-003','hash-3',q1,'{}'::jsonb,o3);
  RAISE EXCEPTION 'cross-visit quote accepted';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_confirmation_quote_scope' THEN
   RAISE EXCEPTION 'unexpected cross-visit constraint %',v_constraint;
  END IF;
 END;

 -- Even with a valid quote, the order must be for the same table session.
 BEGIN
  INSERT INTO sabora.catalog_confirmation_attempts(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   request_key,request_fingerprint,quote_id,economic_evidence,order_id)
  VALUES(t1,s1,'visit-1','basket-1','actor-1',item1,
   'request-004','hash-4',q1,'{}'::jsonb,o2);
  RAISE EXCEPTION 'cross-table order accepted';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_confirmation_order_scope' THEN
   RAISE EXCEPTION 'unexpected cross-table constraint %',v_constraint;
  END IF;
 END;

 -- Database must not accept inconsistent amounts in displayed quote.
 BEGIN
  INSERT INTO sabora.catalog_displayed_quotes(
   table_id,session_id,visit_id,basket_id,actor_id,item_id,
   published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
  VALUES(t1,s1,'visit-1','basket-1','actor-1',item1,
   1,1000,100,901,'{}'::jsonb,now()+interval '5 minutes');
  RAISE EXCEPTION 'inconsistent quote amounts accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint<>'catalog_displayed_quote_amounts' THEN
   RAISE EXCEPTION 'unexpected quote check %',v_constraint;
  END IF;
 END;
 -- A privileged disposable test connection cannot mutate persisted evidence
 -- through ordinary UPDATE or DELETE; both ledgers are append-only.
 BEGIN
  UPDATE sabora.catalog_displayed_quotes SET total_cents=899 WHERE id=q1;
  RAISE EXCEPTION 'displayed quote update accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=MESSAGE_TEXT;
  IF v_constraint<>'catalog_ledger_append_only' THEN
   RAISE EXCEPTION 'unexpected quote update error %',v_constraint;
  END IF;
 END;
 BEGIN
  DELETE FROM sabora.catalog_displayed_quotes WHERE id=q1;
  RAISE EXCEPTION 'displayed quote delete accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=MESSAGE_TEXT;
  IF v_constraint<>'catalog_ledger_append_only' THEN
   RAISE EXCEPTION 'unexpected quote delete error %',v_constraint;
  END IF;
 END;
 BEGIN
  UPDATE sabora.catalog_confirmation_attempts SET request_fingerprint='altered'
   WHERE order_id=o1;
  RAISE EXCEPTION 'confirmation update accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=MESSAGE_TEXT;
  IF v_constraint<>'catalog_ledger_append_only' THEN
   RAISE EXCEPTION 'unexpected confirmation update error %',v_constraint;
  END IF;
 END;
 BEGIN
  DELETE FROM sabora.catalog_confirmation_attempts WHERE order_id=o1;
  RAISE EXCEPTION 'confirmation delete accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=MESSAGE_TEXT;
  IF v_constraint<>'catalog_ledger_append_only' THEN
   RAISE EXCEPTION 'unexpected confirmation delete error %',v_constraint;
  END IF;
 END;
 -- TRUNCATE is a distinct SQL command and does not fire DELETE triggers.
 BEGIN
  TRUNCATE sabora.catalog_displayed_quotes CASCADE;
  RAISE EXCEPTION 'displayed quote truncate accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=MESSAGE_TEXT;
  IF v_constraint<>'catalog_ledger_append_only' THEN
   RAISE EXCEPTION 'unexpected quote truncate error %',v_constraint;
  END IF;
 END;
 BEGIN
  TRUNCATE sabora.catalog_confirmation_attempts;
  RAISE EXCEPTION 'confirmation truncate accepted';
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=MESSAGE_TEXT;
  IF v_constraint<>'catalog_ledger_append_only' THEN
   RAISE EXCEPTION 'unexpected confirmation truncate error %',v_constraint;
  END IF;
 END;
END $ledger$;
ROLLBACK;
