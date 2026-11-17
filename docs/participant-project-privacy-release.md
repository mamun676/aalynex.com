# Issue #4 — Participant-only project reads

## Goal
Stop a signed-in non-admin user reading another creator's project title,
brief, budget, participant identities, paid status and all other project fields.
Preserve the project-invite/accept, ongoing, creator management, payment and chat
flows, plus **public freelancer ratings without exposing raw projects**.

## Deployment order (important)
1. **Completed:** Supabase preparation migration
   `prepare_public_freelancer_stats_for_private_projects` installed in production:
   `public.public_freelancer_stats` remains SECURITY INVOKER and now selects
   safe aggregates from `aalynex_private.freelancer_public_rollup()`.
   Function is SECURITY DEFINER in a schema **not exposed via the Data API**,
   fixed search_path, outputs only public totals and averages. Its EXECUTE
   is granted to anon and authenticated, not PUBLIC.
   Pre/post checks: 6 freelancer rows, 17 completed assignments, 13 reviews.
2. **Needs GitHub merge/deploy:** Merge this frontend PR into the original
   `mamun676/aalynex.com` and confirm GitHub Pages success.
   Creator Home, Browse Editors, Managed Editors, Portfolio and selection wizard
   now read **public stats only**; DB project sync will accept a smaller RLS
   result and clear old project rows when the authorized result is empty.
3. **Needs two-account QA:** As Mamun and Vasu, test creator dashboard,
   Browse Editors sorting/ratings, invite workflow, freelancer Browse Requests,
   accept/open ongoing, chat, attachment preview, final delivery, paid download,
   My Projects, and existing payment history. Avoid new payment for already paid projects.
4. **Only after success apply** the RLS SQL below in Supabase production
   using a tracked migration. Do NOT run the final SQL before step 2/3.
5. Repeat QA and check role-level queries in a transaction.

## Final RLS SQL (not yet applied)
```sql
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_access_for_participants ON public.projects
FOR SELECT TO authenticated
USING (
    creator_id = (SELECT auth.uid())
 OR freelancer_id = (SELECT auth.uid())
 OR (status = 'open' AND (SELECT auth.uid())::text = ANY(invited_freelancers))
 OR (SELECT public.is_admin())
);
```
The existing `projects_admin_read` and `projects_anon_stats_read`
policies stay in place. Anon retains only freelancer_id/status/rating grants
for the public stats legacy path. The new safe public aggregate does not
depend on caller visibility of private project rows.

## Verification (do not fetch private project fields)
```sql
SELECT policyname,roles,cmd,qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'projects' AND cmd='SELECT';
SELECT
  (SELECT COUNT(*) FROM public.projects) AS project_rows,
  (SELECT COUNT(*) FROM public.public_freelancer_stats) AS public_stat_rows;
```
To test signed-in roles, use BEGIN; SET LOCAL ROLE authenticated; set
request.jwt.claim.sub to the test account's authenticated UID via
set_config; query COUNT only; ROLLBACK. Confirm non-admin users see only
their created, assigned, and invited-open rows, and an unrelated user sees
zero. Avoid exposing other users' UIDs or private projects in output.

## Emergency rollback (temporarily re-exposes signed-in project data)
```sql
DROP POLICY IF EXISTS projects_access_for_participants ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
USING (true);
```
Use only after an actual production regression and investigate immediately;
rollback returns the previous broad access.

## Limits
- The frontend changes must deploy before RLS enforcement.
- Other tables (project_attachments, messages, payments) have separate RLS
  and are NOT changed here.
- Historical private project data is never copied to public stats.
- Client cache is memory-only and cleared by logout; hard reload after deploy.
- Database simulations in BEGIN/ROLLBACK are not a substitute for browser QA.
