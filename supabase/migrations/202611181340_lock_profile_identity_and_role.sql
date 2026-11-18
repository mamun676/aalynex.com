-- Existing account safety: role and profile ownership cannot be reassigned by
-- an authenticated browser client. This is additive; it does not rewrite users.
-- A trusted backend role may still perform an intentional administrative change.
CREATE OR REPLACE FUNCTION public.ax_auth_guard_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role)
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Profile account identity and role cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Never expose trigger helper as a browser-callable RPC.
REVOKE ALL ON FUNCTION public.ax_auth_guard_profile_identity()
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'ax_auth_guard_profile_identity_trg'
  ) THEN
    CREATE TRIGGER ax_auth_guard_profile_identity_trg
      BEFORE UPDATE OF id, role ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.ax_auth_guard_profile_identity();
  END IF;
END;
$$;