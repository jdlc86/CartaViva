-- Sabora table QR payload V1. This migration only tightens future token
-- issuance/rotation. It does not create a public endpoint or expose QR data.
BEGIN;

CREATE OR REPLACE FUNCTION sabora.rotate_table_qr(
  p_table_id uuid,
  p_new_token text
)
RETURNS TABLE (new_qr_version integer, new_session_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, sabora
AS $rotate_table_qr_v1$
DECLARE
  v_version integer;
  v_session uuid;
BEGIN
  -- V1 is exactly 32 bytes in canonical, unpadded Base64URL form. Restricting
  -- the final character rejects encodings with non-zero discarded pad bits.
  IF p_table_id IS NULL OR p_new_token IS NULL
     OR p_new_token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' THEN
    RAISE EXCEPTION 'invalid_qr_rotation_input' USING errcode = '22023';
  END IF;

  UPDATE sabora.dining_tables t
    SET qr_token_hash = sha256(convert_to(p_new_token, 'UTF8')),
        qr_version = t.qr_version + 1
    WHERE t.id = p_table_id
    RETURNING t.qr_version, t.session_id INTO v_version, v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_not_found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY SELECT v_version, v_session;
END;
$rotate_table_qr_v1$;

REVOKE ALL ON FUNCTION sabora.rotate_table_qr(uuid,text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION sabora.rotate_table_qr(uuid,text) IS
  'Rotates a table credential using the canonical 32-byte Base64URL token from SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.';

COMMIT;
