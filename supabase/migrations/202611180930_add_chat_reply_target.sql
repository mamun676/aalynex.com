-- Aalynex Chat V2: optional reply-to-message support (additive only).
-- Do not change existing message text, attachments, RLS policies or delivery/payment flows.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;

-- The target must exist, and removing an original message should never delete a reply.
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'axv2_message_reply_target_fk'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT axv2_message_reply_target_fk
      FOREIGN KEY (reply_to_message_id) REFERENCES public.messages (id)
      ON DELETE SET NULL;
  END IF;
END;
$;

CREATE INDEX IF NOT EXISTS axv2_messages_reply_target_idx
  ON public.messages (reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

-- A client cannot link a reply to a message from another conversation.
-- Run with caller privileges; existing participant-only messages SELECT RLS applies.
CREATE OR REPLACE FUNCTION public.axv2_validate_reply_target()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF NEW.reply_to_message_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.reply_to_message_id = NEW.id OR NOT EXISTS (
    SELECT 1 FROM public.messages original
    WHERE original.id = NEW.reply_to_message_id
      AND original.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'Reply must reference a message in this conversation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger routines are not direct client RPC endpoints.
REVOKE ALL ON FUNCTION public.axv2_validate_reply_target() FROM PUBLIC, anon, authenticated;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.messages'::regclass
      AND tgname = 'axv2_validate_reply_target_trg'
  ) THEN
    CREATE TRIGGER axv2_validate_reply_target_trg
      BEFORE INSERT OR UPDATE OF reply_to_message_id, conversation_id
      ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.axv2_validate_reply_target();
  END IF;
END;
$;
