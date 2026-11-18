-- Open Market opt-in; previous invite-only projects stay private by default.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS open_market boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS market_ready boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ax_projects_open_market_active_idx ON public.projects(created_at DESC)
 WHERE open_market IS TRUE AND market_ready IS TRUE AND status = 'open' AND freelancer_id IS NULL;

-- Public listings are visible only to authenticated profiles with freelancer role.
-- Existing participants/invitation policies remain unchanged.
DROP POLICY IF EXISTS "projects_open_market_freelancers_read" ON public.projects;
CREATE POLICY "projects_open_market_freelancers_read" ON public.projects
 FOR SELECT TO authenticated USING (
  open_market IS TRUE AND market_ready IS TRUE
  AND status = 'open' AND freelancer_id IS NULL
  AND creator_id IS DISTINCT FROM (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles pf
    WHERE pf.id = (SELECT auth.uid()) AND pf.role = 'freelancer')
  -- Preserve the existing Managed Editor/Premium restriction.
  AND (NOT EXISTS (SELECT 1 FROM public.managed_editors me
       WHERE me.freelancer_id = (SELECT auth.uid()))
       OR public.has_verified_premium(creator_id))
 );

-- Restrictive checks protect against a freelancer impersonating a creator
-- for *new* Open Market listings. Existing invite-only rows are unaffected.
DROP POLICY IF EXISTS "projects_open_market_creator_insert" ON public.projects;
CREATE POLICY "projects_open_market_creator_insert" ON public.projects
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (open_market IS FALSE OR EXISTS (
   SELECT 1 FROM public.profiles pf
   WHERE pf.id = creator_id AND pf.role = 'creator'
 ));
DROP POLICY IF EXISTS "projects_open_market_creator_update" ON public.projects;
CREATE POLICY "projects_open_market_creator_update" ON public.projects
 AS RESTRICTIVE FOR UPDATE TO authenticated USING (true)
 WITH CHECK (open_market IS FALSE OR EXISTS (
   SELECT 1 FROM public.profiles pf
   WHERE pf.id = creator_id AND pf.role = 'creator'
 ));

-- Intentionally narrow SECURITY DEFINER RPC: only validated freelancer, one conditional UPDATE.
-- Permissions are explicitly restricted to authenticated accounts; no arbitrary row writes.
CREATE OR REPLACE FUNCTION public.ax_claim_open_market_project(p_project_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_actor uuid := (SELECT auth.uid()); v_claimed_id text;
BEGIN
 IF v_actor IS NULL THEN
   RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.profiles pf
    WHERE pf.id = v_actor AND pf.role = 'freelancer') THEN
   RAISE EXCEPTION 'Only freelancer accounts can accept Open Market projects' USING ERRCODE = '42501';
 END IF;
 UPDATE public.projects p SET freelancer_id = v_actor, status = 'ongoing'
  WHERE p.id = p_project_id AND p.open_market IS TRUE AND p.market_ready IS TRUE
    AND p.status = 'open' AND p.freelancer_id IS NULL
    AND p.creator_id IS DISTINCT FROM v_actor
    AND (NOT EXISTS (SELECT 1 FROM public.managed_editors me
         WHERE me.freelancer_id = v_actor)
         OR public.has_verified_premium(p.creator_id))
  RETURNING p.id INTO v_claimed_id;
 RETURN v_claimed_id IS NOT NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.ax_claim_open_market_project(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ax_claim_open_market_project(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ax_claim_open_market_project(text) TO authenticated;


-- Offline-capable in-app notifications. Existing axv8_notifications plumbing is reused;
-- notifications are created once when a listing becomes market_ready, never during upload.
CREATE OR REPLACE FUNCTION axv8_private.open_market_project_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_editor record;
  v_is_publish boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_is_publish := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_is_publish := (OLD.open_market IS DISTINCT FROM TRUE OR OLD.market_ready IS DISTINCT FROM TRUE);
  END IF;

  IF v_is_publish AND NEW.open_market IS TRUE AND NEW.market_ready IS TRUE
     AND NEW.status = 'open' AND NEW.freelancer_id IS NULL THEN
    FOR v_editor IN
      SELECT pf.id
      FROM public.profiles pf
      WHERE pf.role = 'freelancer'
        AND pf.id IS DISTINCT FROM NEW.creator_id
        AND (NOT EXISTS (SELECT 1 FROM public.managed_editors me WHERE me.freelancer_id = pf.id)
          OR public.has_verified_premium(NEW.creator_id))
    LOOP
      PERFORM axv8_private.emit(v_editor.id,
        'project_request', 'New Open Market project',
        'A new project is available. First eligible freelancer to accept gets it.',
        'market:' || NEW.id || ':' || v_editor.id::text, NEW.creator_id, NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ax_open_market_notifications ON public.projects;
CREATE TRIGGER ax_open_market_notifications
AFTER INSERT OR UPDATE OF open_market, market_ready ON public.projects
FOR EACH ROW EXECUTE FUNCTION axv8_private.open_market_project_event();

REVOKE ALL ON FUNCTION axv8_private.open_market_project_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION axv8_private.open_market_project_event() FROM anon, authenticated;
