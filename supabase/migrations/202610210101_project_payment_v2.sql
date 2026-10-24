-- REVIEW/STAGING ONLY. Run once after a database backup and finance-flow review.
-- No historical payment is promoted to verified. Existing Premium triggers remain.
BEGIN;
-- All projects are gated until operator reconciliation; installing this never enables charges.
CREATE TABLE public.ax_project_checkout_approvals (
 project_id text PRIMARY KEY REFERENCES public.projects(id),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 review_reference text NOT NULL CHECK (length(review_reference) BETWEEN 8 AND 256),
 enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE public.ax_project_checkout_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ax_project_checkout_approvals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ax_project_checkout_approvals TO service_role;

CREATE TABLE public.ax_project_order_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES public.projects(id),
 creator_id uuid NOT NULL,
 freelancer_id uuid NOT NULL,
 budget_rupees integer NOT NULL CHECK (budget_rupees > 0),
 commission_rate integer NOT NULL CHECK (commission_rate BETWEEN 0 AND 100),
 amount_paise bigint NOT NULL CHECK (amount_paise > 0),
 freelancer_rupees integer NOT NULL CHECK (freelancer_rupees >= 0),
 platform_rupees integer NOT NULL CHECK (platform_rupees >= 0),
 currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
 receipt text NOT NULL UNIQUE,
 provider_order_id text UNIQUE,
 state text NOT NULL DEFAULT 'creating' CHECK (state IN ('creating','ready','verified')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id)
);
CREATE TABLE public.ax_project_payment_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL UNIQUE REFERENCES public.projects(id),
 intent_id uuid NOT NULL UNIQUE REFERENCES public.ax_project_order_intents(id),
 payment_row_id uuid NOT NULL UNIQUE REFERENCES public.payments(id),
 provider_order_id text NOT NULL UNIQUE,
 provider_payment_id text NOT NULL UNIQUE,
 amount_paise bigint NOT NULL CHECK (amount_paise > 0),
 currency text NOT NULL CHECK (currency = 'INR'),
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ax_project_order_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ax_project_payment_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ax_project_order_intents, public.ax_project_payment_proofs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ax_project_order_intents, public.ax_project_payment_proofs TO service_role;
-- Preflight reported no duplicates. Abort transaction if concurrent/hidden duplicates exist.
CREATE UNIQUE INDEX ax_payments_provider_payment_unique ON public.payments(razorpay_payment_id);
CREATE UNIQUE INDEX ax_payments_provider_order_unique ON public.payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

CREATE FUNCTION public.ax_guard_project_payment_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 -- Function owner never determines caller privilege; verified gateway JWT role does.
 IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.paid IS TRUE OR NEW.status = 'completed' THEN
   RAISE EXCEPTION 'Settlement must be verified by server';
  END IF;
  IF NEW.commission_rate IS DISTINCT FROM 15 THEN
   RAISE EXCEPTION 'Commission is server managed';
  END IF;
 ELSE
  IF NEW.paid IS DISTINCT FROM OLD.paid OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
   RAISE EXCEPTION 'Settlement fields are server managed';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Project ID is immutable'; END IF;
  IF NEW.creator_id IS DISTINCT FROM OLD.creator_id THEN RAISE EXCEPTION 'Project owner is immutable'; END IF;
  IF EXISTS (SELECT 1 FROM public.ax_project_order_intents i WHERE i.project_id = OLD.id) THEN
   IF ROW(NEW.budget,NEW.freelancer_id,NEW.status,NEW.edited_uploaded) IS DISTINCT FROM ROW(OLD.budget,OLD.freelancer_id,OLD.status,OLD.edited_uploaded) THEN
    RAISE EXCEPTION 'Payment intent exists; settlement changes require support';
   END IF;
  ELSIF OLD.paid IS TRUE AND ROW(NEW.budget,NEW.freelancer_id,NEW.status,NEW.edited_uploaded) IS DISTINCT FROM ROW(OLD.budget,OLD.freelancer_id,OLD.status,OLD.edited_uploaded) THEN
   RAISE EXCEPTION 'Historical paid project settlement is locked';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ax_project_payment_fields_guard BEFORE INSERT OR UPDATE ON public.projects
 FOR EACH ROW EXECUTE FUNCTION public.ax_guard_project_payment_fields();

CREATE FUNCTION public.ax_prepare_project_order(p_project_id text, p_caller uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p public.projects%ROWTYPE; i public.ax_project_order_intents%ROWTYPE;
 total_rupees bigint; editor_rupees integer; iid uuid := gen_random_uuid();
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
 IF NOT FOUND OR p.creator_id IS DISTINCT FROM p_caller THEN RAISE EXCEPTION 'Project unavailable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.ax_project_checkout_approvals WHERE project_id=p.id AND enabled) THEN RAISE EXCEPTION 'Project requires provider reconciliation before checkout'; END IF;
 IF p.paid IS TRUE OR EXISTS (SELECT 1 FROM public.payments WHERE project_id=p.id AND status='paid') THEN
  RAISE EXCEPTION 'Historical/already paid project requires reconciliation, not another charge';
 END IF;
 IF p.status IS DISTINCT FROM 'ongoing' OR p.freelancer_id IS NULL OR p.edited_uploaded IS NOT TRUE THEN
  RAISE EXCEPTION 'Project is not eligible for payment';
 END IF;
 IF p.budget IS NULL OR p.budget <= 0 OR p.commission_rate IS NULL OR p.commission_rate NOT BETWEEN 0 AND 100 THEN
  RAISE EXCEPTION 'Invalid server pricing';
 END IF;
 SELECT * INTO i FROM public.ax_project_order_intents WHERE project_id=p.id;
 IF FOUND THEN RETURN to_jsonb(i) || jsonb_build_object('is_new',false); END IF;
 total_rupees := p.budget::bigint + round(p.budget::numeric * 0.03)::bigint;
 IF total_rupees > 2147483647 THEN RAISE EXCEPTION 'Amount exceeds ledger integer range'; END IF;
 editor_rupees := round(p.budget::numeric * (100-p.commission_rate) / 100)::integer;
 INSERT INTO public.ax_project_order_intents(id,project_id,creator_id,freelancer_id,budget_rupees,commission_rate,amount_paise,freelancer_rupees,platform_rupees,receipt)
 VALUES(iid,p.id,p.creator_id,p.freelancer_id,p.budget,p.commission_rate,total_rupees*100,editor_rupees,(total_rupees-editor_rupees)::integer,'ax_'||replace(iid::text,'-','')) RETURNING * INTO i;
 RETURN to_jsonb(i) || jsonb_build_object('is_new',true);
END $$;

CREATE FUNCTION public.ax_attach_project_order(p_intent_id uuid,p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE i public.ax_project_order_intents%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_order_id IS NULL OR p_order_id !~ '^order_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid order'; END IF;
 SELECT * INTO i FROM public.ax_project_order_intents WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Intent unavailable'; END IF;
 IF i.provider_order_id IS NOT NULL AND i.provider_order_id <> p_order_id THEN RAISE EXCEPTION 'Order already bound'; END IF;
 IF i.state='verified' THEN RAISE EXCEPTION 'Already settled'; END IF;
 UPDATE public.ax_project_order_intents SET provider_order_id=p_order_id,state='ready' WHERE id=i.id;
END $$;

CREATE FUNCTION public.ax_finalize_project_payment(p_intent_id uuid,p_order_id text,p_payment_id text,p_amount_paise bigint,p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE i public.ax_project_order_intents%ROWTYPE; p public.projects%ROWTYPE;
 proof public.ax_project_payment_proofs%ROWTYPE; payid uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 -- Consistent lock order: project, then intent (same as prepare).
 SELECT * INTO i FROM public.ax_project_order_intents WHERE id=p_intent_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown intent'; END IF;
 SELECT * INTO p FROM public.projects WHERE id=i.project_id FOR UPDATE;
 SELECT * INTO i FROM public.ax_project_order_intents WHERE id=p_intent_id FOR UPDATE;
 IF p_order_id IS DISTINCT FROM i.provider_order_id OR p_amount_paise IS DISTINCT FROM i.amount_paise OR p_currency IS DISTINCT FROM i.currency
  OR p_payment_id IS NULL OR p_payment_id !~ '^pay_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Proof does not match intent'; END IF;
 SELECT * INTO proof FROM public.ax_project_payment_proofs WHERE intent_id=i.id;
 IF FOUND THEN
  IF proof.provider_payment_id <> p_payment_id THEN RAISE EXCEPTION 'Different payment already settled'; END IF;
  RETURN jsonb_build_object('ok',true,'already',true,'project_id',i.project_id,'amount_paise',i.amount_paise);
 END IF;
 IF i.state <> 'ready' OR p.paid IS TRUE OR p.creator_id IS DISTINCT FROM i.creator_id OR p.freelancer_id IS DISTINCT FROM i.freelancer_id
  OR p.budget IS DISTINCT FROM i.budget_rupees OR p.commission_rate IS DISTINCT FROM i.commission_rate
  OR p.status IS DISTINCT FROM 'ongoing' OR p.edited_uploaded IS NOT TRUE THEN RAISE EXCEPTION 'Project changed; reconciliation required'; END IF;
 INSERT INTO public.payments(project_id,creator_id,freelancer_id,razorpay_order_id,razorpay_payment_id,amount,currency,status,platform_fee,freelancer_amount)
 VALUES(i.project_id,i.creator_id,i.freelancer_id,p_order_id,p_payment_id,(i.amount_paise/100)::integer,i.currency,'paid',i.platform_rupees,i.freelancer_rupees) RETURNING id INTO payid;
 INSERT INTO public.ax_project_payment_proofs(project_id,intent_id,payment_row_id,provider_order_id,provider_payment_id,amount_paise,currency)
 VALUES(i.project_id,i.id,payid,p_order_id,p_payment_id,i.amount_paise,i.currency);
 UPDATE public.projects SET paid=true,status='completed' WHERE id=i.project_id;
 UPDATE public.ax_project_order_intents SET state='verified' WHERE id=i.id;
 RETURN jsonb_build_object('ok',true,'already',false,'project_id',i.project_id,'amount_paise',i.amount_paise);
END $$;
REVOKE ALL ON FUNCTION public.ax_guard_project_payment_fields() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ax_prepare_project_order(text,uuid), public.ax_attach_project_order(uuid,text), public.ax_finalize_project_payment(uuid,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ax_prepare_project_order(text,uuid), public.ax_attach_project_order(uuid,text), public.ax_finalize_project_payment(uuid,text,text,bigint,text) TO service_role;
COMMIT;
