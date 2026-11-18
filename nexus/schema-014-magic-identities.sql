BEGIN;
-- Permanent identities are independent of cookie encryption keys.
-- Refuse silent re-keying: see MAGIC-PAYMENT-RECOVERY.md for legacy staging data.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM nexus_conference_attendees WHERE issuer='urn:dig:nexus:magic')
 THEN RAISE EXCEPTION 'Legacy magic attendees require reviewed migration before 014'; END IF;
END $$;
CREATE TABLE nexus_magic_identities (
 email text PRIMARY KEY CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
 subject text NOT NULL UNIQUE DEFAULT ('magic:'||gen_random_uuid()::text)
 CHECK(subject ~ '^magic:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
-- Verify a one-use token before allocating a session. The final consume remains atomic.
-- A concurrent redemption may still win between this check and the consume;
-- that caller must revoke its unused session and report an expired link.
CREATE FUNCTION nexus_magic_available(p_hash text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
  SELECT 1 FROM nexus_conference_magic_links
  WHERE token_hash=p_hash AND expires_at>now()
 )
$$;
CREATE OR REPLACE FUNCTION nexus_magic_consume(p_hash text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result nexus_conference_magic_links%ROWTYPE; stable_subject text;
BEGIN
 DELETE FROM nexus_conference_magic_links WHERE token_hash=p_hash AND expires_at>now() RETURNING * INTO result;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- The unique email constraint serializes simultaneous first redemptions.
 INSERT INTO nexus_magic_identities(email) VALUES(result.email)
 ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email
 RETURNING subject INTO stable_subject;
 RETURN jsonb_build_object('email',result.email,'eventSlug',result.event_slug,'subject',stable_subject);
END $$;
COMMIT;
