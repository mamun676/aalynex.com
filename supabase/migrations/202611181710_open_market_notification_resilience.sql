-- Keep project publishing available even if the notification inbox service errors.
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
EXCEPTION WHEN OTHERS THEN
  -- Notification errors must never prevent creator project publishing.
  RAISE LOG 'ax open market notification failed: %', SQLSTATE;
  RETURN NEW;
END;
$fn$;
