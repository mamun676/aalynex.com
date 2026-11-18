# Aalynex Open Market — safe rollout

## Behaviour
- Creator: Post / Manage → Step 5 (Freelancer). Choose **Select Freelancers** (existing invitation flow) or **Open Market**.
- Open Market project is inserted with `open_market=true`. It becomes visible as soon as `market_ready=true`, which is set at insert if there are no files, or only after every file upload and attachment record is complete.
- All **eligible** signed-in freelancer accounts see a market listing on Project Requests and Requests count. Active sessions receive a Realtime toast, offline accounts see it on next sign-in or refresh.
- Managed Editors remain subject to the existing verified-Premium restriction. A creator without Premium cannot reach those editor accounts through Open Market.
- Claiming is done by `ax_claim_open_market_project` on the server, with an atomic conditional `UPDATE`. Exactly one claim can succeed. The project becomes `ongoing`, assigned to one freelancer.
- Creator source files are NOT included in the Open Market preview; existing signed download authorization applies after acceptance. The server must enforce source-file access.
- No bulk email is sent to all freelancers; availability is in-app with Realtime alerts (while connected).

## Deployment order
1. Verify base project/branch and existing production backup.
2. Apply the reviewed migration `202611181616_open_market_first_accept.sql` using Supabase migration tooling.
3. Confirm the two Boolean columns, SELECT policy, RPC's privileges and realtime publication.
4. Deploy frontend changes only after successful migration.
5. Test using creator and at least two actual freelancer accounts: posting no-files, posting with-files, private invite, a race between two accepts, visibility and access after claim.
6. Rollback frontend first if needed. Database columns default false and are backward-compatible; do not drop columns while active market projects exist.

## Known compatibility constraints
- The pre-existing table policy `project_attachments.attachments_select` remains unchanged by this migration. The new UI hides names of source files before acceptance; the S3 signing endpoint is responsible for read authorization.
- Open Market does not replace existing invitation flow, chats, payments, or Managed Editing subscription.
- Automatic email broadcasts, push notifications, project cancellation, expiration, editor availability and preference matching are not part of this first version.
