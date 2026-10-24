-- REVIEW ONLY. Requires payment migration 1. No file/preview dependencies.
BEGIN;
CREATE TABLE public.ax_project_webhook_receipts (
 event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 256),
 body_hash text NOT NULL CHECK(body_hash ~ '^[a-f0-9]{64}$'),
 event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 100),
 provider_payment_id text,
 provider_order_id text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','complete','ignored','review')),
 outcome text,
 attempts integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 last_error_code text,
 retry_count integer NOT NULL DEFAULT 0,
 next_retry_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ax_project_payment_holds (
 intent_id uuid PRIMARY KEY REFERENCES public.ax_project_order_intents(id),
 reason text NOT NULL CHECK(reason IN ('refund_event','dispute_event','provider_refund','ambiguous_payments','manual_review')),
 source_ref text NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 256),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ax_project_webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ax_project_payment_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ax_project_webhook_receipts,public.ax_project_payment_holds FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ax_project_webhook_receipts,public.ax_project_payment_holds TO service_role;
ALTER TABLE public.ax_project_order_intents
 ADD COLUMN next_reconcile_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN last_reconciled_at timestamptz,
 ADD COLUMN last_reconcile_outcome text;
CREATE INDEX ax_project_reconcile_due ON public.ax_project_order_intents(next_reconcile_at,id);
CREATE INDEX ax_project_receipts_pending ON public.ax_project_webhook_receipts(next_retry_at) WHERE state='pending';
CREATE FUNCTION public.ax_register_project_event(p_event_id text,p_hash text,p_type text,p_payment_id text,p_order_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.ax_project_webhook_receipts%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_payment_id IS NOT NULL AND p_payment_id !~ '^pay_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 IF p_order_id IS NOT NULL AND p_order_id !~ '^order_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid order'; END IF;
 INSERT INTO public.ax_project_webhook_receipts(event_id,body_hash,event_type,provider_payment_id,provider_order_id)
 VALUES(p_event_id,p_hash,p_type,p_payment_id,p_order_id)
 ON CONFLICT(event_id) DO UPDATE SET attempts=ax_project_webhook_receipts.attempts+1,last_seen_at=now() RETURNING * INTO r;
 IF r.body_hash IS DISTINCT FROM p_hash OR r.event_type IS DISTINCT FROM p_type OR r.provider_payment_id IS DISTINCT FROM p_payment_id OR r.provider_order_id IS DISTINCT FROM p_order_id THEN RAISE EXCEPTION 'Event collision'; END IF;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.ax_finish_project_event(p_event_id text,p_hash text,p_state text,p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_state NOT IN ('complete','ignored','review') OR p_state IS NULL OR length(p_outcome)>100 THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 UPDATE public.ax_project_webhook_receipts SET state=p_state,outcome=p_outcome,completed_at=now(),last_error_code=NULL
 WHERE event_id=p_event_id AND body_hash=p_hash AND state='pending';
END $$;
CREATE FUNCTION public.ax_retry_project_event(p_event_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 UPDATE public.ax_project_webhook_receipts SET last_error_code='retry_required',retry_count=retry_count+1,next_retry_at=now()+interval '5 minutes'
 WHERE event_id=p_event_id AND state='pending';
END $$;
CREATE FUNCTION public.ax_hold_project_payment(p_intent_id uuid,p_order_id text,p_reason text,p_source_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.ax_project_order_intents%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 SELECT * INTO i FROM public.ax_project_order_intents WHERE id=p_intent_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Intent unavailable'; END IF;
 PERFORM 1 FROM public.projects WHERE id=i.project_id FOR UPDATE;
 SELECT * INTO i FROM public.ax_project_order_intents WHERE id=p_intent_id FOR UPDATE;
 IF i.provider_order_id IS DISTINCT FROM p_order_id OR p_order_id IS NULL THEN RAISE EXCEPTION 'Order mismatch'; END IF;
 INSERT INTO public.ax_project_payment_holds(intent_id,reason,source_ref)
 VALUES(i.id,p_reason,p_source_ref) ON CONFLICT(intent_id) DO UPDATE SET active=true,last_seen_at=now();
 -- Do not change historical paid flags, issue refunds, release money, or erase ledger records.
END $$;
ALTER FUNCTION public.ax_finalize_project_payment(uuid,text,text,bigint,text) RENAME TO ax_finalize_project_payment_v1;
REVOKE ALL ON FUNCTION public.ax_finalize_project_payment_v1(uuid,text,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ax_finalize_project_payment(p_intent_id uuid,p_order_id text,p_payment_id text,p_amount_paise bigint,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE i public.ax_project_order_intents%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 SELECT * INTO i FROM public.ax_project_order_intents WHERE id=p_intent_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Intent unavailable'; END IF;
 PERFORM 1 FROM public.projects WHERE id=i.project_id FOR UPDATE;
 PERFORM 1 FROM public.ax_project_order_intents WHERE id=i.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.ax_project_payment_holds WHERE intent_id=i.id AND active) THEN
  RETURN jsonb_build_object('ok',false,'status','held','project_id',i.project_id);
 END IF;
 RETURN public.ax_finalize_project_payment_v1(p_intent_id,p_order_id,p_payment_id,p_amount_paise,p_currency);
END $$;
ALTER FUNCTION public.ax_prepare_project_order(text,uuid) RENAME TO ax_prepare_project_order_v2;
REVOKE ALL ON FUNCTION public.ax_prepare_project_order_v2(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.ax_prepare_project_order(p_project_id text,p_caller uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.ax_project_order_intents i JOIN public.ax_project_payment_holds h ON h.intent_id=i.id WHERE i.project_id=p_project_id AND h.active) THEN RAISE EXCEPTION 'Payment review required'; END IF;
 RETURN public.ax_prepare_project_order_v2(p_project_id,p_caller);
END $$;
-- A new hold blocks changing this managed payment's DB release marker to 'released'.
-- This cannot reverse an external bank transfer; finance tooling still needs review.
CREATE FUNCTION public.ax_guard_held_payment_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.release_status='released' AND NEW.release_status IS DISTINCT FROM OLD.release_status THEN
  PERFORM 1 FROM public.projects WHERE id=OLD.project_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.ax_project_payment_proofs p JOIN public.ax_project_payment_holds h ON h.intent_id=p.intent_id WHERE p.payment_row_id=OLD.id AND h.active) THEN
   RAISE EXCEPTION 'Managed payment release requires hold review';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ax_held_payment_release_guard BEFORE UPDATE OF release_status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.ax_guard_held_payment_release();
REVOKE ALL ON FUNCTION public.ax_guard_held_payment_release() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ax_retry_project_event(text),public.ax_register_project_event(text,text,text,text,text),public.ax_finish_project_event(text,text,text,text),public.ax_hold_project_payment(uuid,text,text,text),public.ax_finalize_project_payment(uuid,text,text,bigint,text),public.ax_prepare_project_order(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ax_retry_project_event(text),public.ax_register_project_event(text,text,text,text,text),public.ax_finish_project_event(text,text,text,text),public.ax_hold_project_payment(uuid,text,text,text),public.ax_finalize_project_payment(uuid,text,text,bigint,text),public.ax_prepare_project_order(text,uuid) TO service_role;
COMMIT;
