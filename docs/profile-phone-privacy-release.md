# Aalynex — profile phone privacy release

## Scope
Stage 1 **already applied** to live Supabase: revoke `anon` SELECT on
`public.profiles`. Public freelancer browsing continues via
`public.public_freelancer_profiles` (does not include phone).

Stage 2 **already applied** to live Supabase: `public.ax_my_profile_phone()`
returns only `auth.uid()`'s phone. EXECUTE is granted only to
`authenticated`; anonymous and PUBLIC EXECUTE revoked. Function uses
`SECURITY DEFINER` with empty `search_path` and qualified tables.

## Required deployment order — do not reverse
1. Merge this frontend change into `mamun676/aalynex.com` and confirm
   the GitHub Pages deployment succeeds. The new UI requests only the
   non-private fields from `profiles`, and loads its own phone via RPC.
2. Test *two different authenticated accounts*: login, session restoration,
   creator/freelancer profile screens, profile phone edit/save and reload,
   creator browse freelancers, invite/accept and public shared profiles.
   Also test a fresh signup if a suitable test account is available.
3. ONLY AFTER successful testing: apply the column privilege migration below
   to the connected Supabase production database.
4. Verify privilege checks and repeat step 2 with new sessions.
   Do not run this migration before the frontend is deployed.

## Stage 3 SQL — apply as a tracked Supabase migration, not in the browser
```sql
REVOKE SELECT ON TABLE public.profiles FROM authenticated;
GRANT SELECT (
  id, name, role, profession, platform, avatar, created_at,
  skills, portfolio_links, resume_url, photo_url, experience,
  specialization, min_price_longform, min_price_reel
) ON TABLE public.profiles TO authenticated;
```

The old `SELECT *` operations will fail after stage 3. This repository's
application code has been updated to select an explicit allowlist.
Existing external clients must be checked independently.

## Production verification query
```sql
select
  has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_table_read,
  has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT') as signed_in_phone_read,
  has_column_privilege('authenticated', 'public.profiles', 'name', 'SELECT') as signed_in_name_read,
  has_function_privilege('anon', 'public.ax_my_profile_phone()', 'EXECUTE') as anon_phone_rpc,
  has_function_privilege('authenticated', 'public.ax_my_profile_phone()', 'EXECUTE') as own_phone_rpc;
```
Expected: `false, false, true, false, true`.

## Rollback (only if urgent; temporarily re-exposes phone to authenticated users)
```sql
GRANT SELECT ON TABLE public.profiles TO authenticated;
```
This privilege rollback is **not** the preferred long-term state and must
be followed by a complete security fix.

## Caveats
- Public profile views currently use `security_definer`; separate audit needed.
- Other public data fields may require an additional privacy review.
- This change does not adjust account ownership, payment logic or file storage.
- Do not log or expose user phone values in test output.
