-- Aalynex Chat V2 (opt-in). Additive-only migration.
-- Existing messages/conversations, protected delivery and payment tables are untouched.

CREATE TABLE IF NOT EXISTS public.axv2_message_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT axv2_read_after_delivery CHECK (read_at IS NULL OR read_at >= delivered_at)
);

CREATE INDEX IF NOT EXISTS axv2_receipts_conversation_user_idx
  ON public.axv2_message_receipts (conversation_id, user_id);

ALTER TABLE public.axv2_message_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.axv2_message_receipts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.axv2_message_receipts TO authenticated;
GRANT ALL ON TABLE public.axv2_message_receipts TO service_role;

CREATE POLICY axv2_receipts_participant_read
ON public.axv2_message_receipts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.user1_id = (SELECT auth.uid()) OR c.user2_id = (SELECT auth.uid()))
  )
);

CREATE POLICY axv2_receipts_receiver_insert
ON public.axv2_message_receipts FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND m.conversation_id = conversation_id
      AND m.receiver_id = (SELECT auth.uid())
  )
);

CREATE POLICY axv2_receipts_receiver_update
ON public.axv2_message_receipts FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND m.conversation_id = conversation_id
      AND m.receiver_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND m.conversation_id = conversation_id
      AND m.receiver_id = (SELECT auth.uid())
  )
);

-- One bounded RPC call acknowledges a batch.  This never writes message rows.
-- Both INSERT and conflict UPDATE run under the receiver's own RLS.
CREATE OR REPLACE FUNCTION public.axv2_ack_messages(
  p_message_ids uuid[], p_read boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_user uuid := auth.uid(); v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  IF p_message_ids IS NULL OR cardinality(p_message_ids) > 100 THEN
    RAISE EXCEPTION 'Provide at most 100 message IDs' USING ERRCODE = '22023';
  END IF;
  WITH inserted AS (
    INSERT INTO public.axv2_message_receipts
      (message_id, conversation_id, user_id, delivered_at, read_at)
    SELECT m.id, m.conversation_id, v_user, now(),
           CASE WHEN coalesce(p_read, false) THEN now() ELSE NULL END
    FROM public.messages m
    WHERE m.id = ANY(p_message_ids) AND m.receiver_id = v_user
    ON CONFLICT (message_id, user_id) DO UPDATE
      SET read_at = CASE
        WHEN coalesce(p_read, false)
        THEN coalesce(public.axv2_message_receipts.read_at, EXCLUDED.read_at)
        ELSE public.axv2_message_receipts.read_at
      END
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.axv2_ack_messages(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.axv2_ack_messages(uuid[], boolean) TO authenticated, service_role;

-- Approximate 'last active'. Unlike each user's private old Presence channel,
-- this is a shared server-verified heartbeat with per-peer SELECT authorization.
CREATE TABLE IF NOT EXISTS public.axv2_presence (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_active_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.axv2_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.axv2_presence FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.axv2_presence TO authenticated;
GRANT ALL ON TABLE public.axv2_presence TO service_role;

CREATE POLICY axv2_presence_conversation_peers
ON public.axv2_presence FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid()) OR (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE (c.user1_id = (SELECT auth.uid()) AND c.user2_id = axv2_presence.user_id)
         OR (c.user2_id = (SELECT auth.uid()) AND c.user1_id = axv2_presence.user_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE
        (p.creator_id = (SELECT auth.uid()) AND
         (p.freelancer_id = axv2_presence.user_id OR axv2_presence.user_id::text = ANY(p.invited_freelancers)))
        OR
        (p.creator_id = axv2_presence.user_id AND
         (p.freelancer_id = (SELECT auth.uid()) OR (SELECT auth.uid())::text = ANY(p.invited_freelancers)))
    )
  )
);
CREATE POLICY axv2_presence_self_insert
ON public.axv2_presence FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY axv2_presence_self_update
ON public.axv2_presence FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.axv2_touch_presence() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.axv2_presence (user_id, last_active_at)
  VALUES (v_user, now())
  ON CONFLICT (user_id) DO UPDATE SET last_active_at = EXCLUDED.last_active_at;
END;
$$;
REVOKE ALL ON FUNCTION public.axv2_touch_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.axv2_touch_presence() TO authenticated, service_role;


-- Stop browser roles from supplying forged delivery/read/last-active timestamps.
-- These triggers run only on the NEW optional V2 tables, never on legacy messages.
CREATE OR REPLACE FUNCTION public.axv2_receipt_server_timestamps()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.delivered_at := now();
    IF NEW.read_at IS NOT NULL THEN NEW.read_at := now(); END IF;
  ELSE
    NEW.delivered_at := OLD.delivered_at;
    NEW.read_at := CASE WHEN OLD.read_at IS NOT NULL THEN OLD.read_at
                        WHEN NEW.read_at IS NOT NULL THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.axv2_receipt_server_timestamps() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER axv2_receipt_server_timestamps
BEFORE INSERT OR UPDATE ON public.axv2_message_receipts
FOR EACH ROW EXECUTE FUNCTION public.axv2_receipt_server_timestamps();

CREATE OR REPLACE FUNCTION public.axv2_presence_server_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  NEW.last_active_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.axv2_presence_server_timestamp() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER axv2_presence_server_timestamp
BEFORE INSERT OR UPDATE ON public.axv2_presence
FOR EACH ROW EXECUTE FUNCTION public.axv2_presence_server_timestamp();

-- Realtime receipts are visible only to authorized conversation participants (RLS).
-- Typing status already belongs to the existing supabase_realtime publication.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'axv2_message_receipts'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.axv2_message_receipts;
  END IF;
END;
$$;
