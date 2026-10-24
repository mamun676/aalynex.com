# Project V2 webhook: diagnostic cleanup and validation

## Source scope

- Retain fixed INVALID_SIGNATURE and WRONG_ACCOUNT diagnostic labels. Never log signatures, raw event bodies, secrets, or customer data.
- The final index.ts does not contain the temporary signed-probe route.
- All other supplied V2 handlers, shared modules, and the two existing migrations are unchanged from the uploaded source archive.
- Premium endpoints, frontend checkout, live provider configuration, and checkout enablement are not modified by this package.
- Supabase secret values belong only in private configuration, never Git. API key secret and webhook secret are different settings.

## Validation actually performed

182 offline assertions passed against the packaged source:
- 27 provider/signature fixture assertions.
- 23 raw-body/signature/event/order-search assertions.
- 90 actual endpoint-module assertions using mocked provider/Supabase services.
- 42 diagnostic/probe-removal assertions, including invalid signatures/account, no side effects before validation, retry handling, oversized body, duplicate delivery, and removed probe.

These are local fixture tests, not 182 live checks. Database SQL was not executed by this cleanup validation. Deno deployment and real provider settlement were not tested by these commands.

The operator separately reported a live diagnostic probe result: incorrect signature returned HTTP 400; correct signature returned HTTP 200 with signature_verified=true and probe_only=true. That probe bypassed account/event/receipt/recovery processing after successful signature verification, so it is not evidence of actual Razorpay delivery or automatic settlement. The operator reports rotating the dedicated V2 webhook secret in both Razorpay and Supabase. No secret value is included here.

## Remaining operational steps

1. Install this final local source; then deploy only project-payment-webhook-v2 to remove the temporary probe from the live function. Local source installation or Git commit alone does not change the live function.
2. Do not reapply existing migrations as part of cleanup. Do not change Premium webhook configuration or API keys.
3. Keep the checkout gate at its reviewed operator setting; this package does not enable it. Do not charge a new payment merely for this test.
4. At the next authorized genuine event, verify actual Razorpay delivery, account validation, durable receipt/outcome and authoritative provider settlement. Old retries can retain an old signing secret and may still fail verification after rotation.
5. Do not mark production webhook delivery/automatic recovery verified until that evidence is available. No payout release is authorized by this source commit.

## Reproduce local checks (Node 24+)

```sh
node tests/project-provider.test.mjs
node tests/project-recovery-core.test.mjs
node --experimental-vm-modules tests/project-recovery-endpoints.test.mjs
node --experimental-vm-modules tests/project-webhook-diagnostics.test.mjs
```

Experimental VM/type stripping warnings are expected. These tests use no production credentials, provider requests or database connections.
