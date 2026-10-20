# Phase 2 database setup

The application has two independent modes:

- **Local demo:** the original samples and browser-local records. No account or database is required.
- **Shared workspace:** Supabase PostgreSQL/PostGIS, Supabase Auth, and a private Storage bucket. The same signed-in resident sees their reports on other devices; staff see incidents assigned to their agencies. Local samples and photos are never imported automatically.

The shared backend is implemented but must be connected to your own Supabase project. No hosted account, email provider, or live production database is created by this repository.

## 1. Create the project and apply the migration

Create a new Supabase project. Keep database credentials and secret/service-role keys out of the frontend and GitHub.

For a first setup, open the project's SQL Editor and run the entire contents of:

`supabase/migrations/202610200001_backend.sql`

The migration creates the tables, geographic indexes, access policies, reporting functions, and the private `report-photos` bucket. It expects PostGIS in the `extensions` schema. Use a fresh project or check the existing extension schema before running it. Existing application tables with these names are not overwritten or migrated automatically.

Alternatively, with the Supabase CLI installed and authenticated:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Supabase local development through its CLI requires Docker. Docker is not needed for this repository's database regression tests.

## 2. Choose test or live routing

For a **shared test workspace**, run `supabase/seed.sql` in the SQL Editor. It inserts only fictional agencies and service areas, not resident accounts or incident records. Keep the connection's workspace setting at **Shared test workspace**. Demo fixtures are never used to route a live-workspace report.

For a **live workspace**, do not treat the seed as real coverage. Import verified agencies and category-specific service polygons marked `is_demo = false`, including source URL and verification date. Until then, a real report saves successfully in the manual-review queue. Phase 2 does not claim Southern California coverage or external delivery.

For now, service-area `district` is a nullable label; importing independently maintained congressional boundaries is a later routing phase.

## 3. Configure authentication

In Supabase Authentication settings:

- Enable email/password sign-up.
- Set Site URL to your deployed app origin.
- Allow that origin as a redirect URL, plus `http://127.0.0.1:4173` for local development.
- Keep email confirmation enabled. Use the app's Create account button, confirm the received email, then sign in. If confirmation opens on a different device, return to the original app and sign in there too.
- Configure production email delivery and usage controls before a real pilot. Default hosted email limits can affect testing.

No user can promote themselves to staff or coordinator from the application.

## 4. Connect the app

Install and build the client:

```sh
npm ci
npm run build
npm start
```

Open **Connect database**, enter the Supabase base project URL and **publishable key** (a legacy `anon` key is also accepted), choose the workspace, and select Connect database. Then sign in or create an account.

The connection choice is saved on that browser. Repeat the connection step on other devices. The key is intentionally public: database row-level security and authenticated reporting functions protect data. The app rejects known secret/service-role key formats.

To preconfigure the connection for all visitors, put only the URL, publishable key, and environment into `dist/backend-config.js`, then rebuild and deploy. These values are included in frontend source by design. Do not put database passwords, secret keys, or service-role keys there.

## 5. Assign staff and coordinator access

Create the relevant accounts first. In the Supabase SQL Editor, look up their user IDs in Authentication → Users. An administrator then inserts assignments using the actual UUIDs:

```sql
-- Replace every placeholder with actual UUIDs before running.
insert into public.agency_members(user_id, agency_id)
values ('STAFF_USER_UUID'::uuid, 'AGENCY_UUID'::uuid);

-- Coordinators can see unassigned incidents and manually assign departments.
insert into public.workspace_admins(user_id)
values ('COORDINATOR_USER_UUID'::uuid);
```

Staff can update their agencies' incidents. Coordinators can manage all incidents and assign departments. Residents can read their own reports and associated status history. Supporting a nearby incident does not expose other residents' descriptions or photos. Nearby suggestions return only a sanitized issue summary.

All status notes are resident-visible in this phase. Internal-only notes are not implemented. No resident contact information is stored in the exposed application tables. Auth email remains in Supabase Auth.

## 6. Verify across devices

1. Connect and sign in as a resident on device/browser A.
2. Submit a report with a photo. Record its `CR-…` reference.
3. On device/browser B, connect to the same project/environment and sign in as the same resident. Select Refresh reports; verify the record appears.
4. Sign in as assigned staff in another browser profile. Open the Agency desk and update status with a note.
5. On device A, refresh reports and reopen the incident. Confirm the update appears.
6. Sign in as an unrelated resident. Confirm they cannot read the private incident or update it.
7. Simulate a failed upload: the incident must stay saved, show photo pending, and offer a file picker to retry.

The app refreshes records every 15 seconds while visible and has a manual refresh button. An already-open detail dialog keeps its revision; stale writes are rejected rather than overwriting another staff member's update. Reopen the dialog after refreshing to see changes.

## Save and retry behavior

- Submission is one database transaction for the incident, resident evidence, routing, history, and optional photo reservation.
- A stable request UUID prevents duplicate inserts when a request succeeds but its response is lost.
- Photos upload **after** the report commits. A failed upload does not roll back the report.
- Photos have immutable reserved paths. Retry can finalize an existing upload after a lost response.
- The bucket is private, limits JPEG uploads to 3 MB, and grants access only to the owner or authorized staff. Images display using five-minute signed URLs; reopen the report to renew an expired URL.
- Stored reports are never silently substituted with local demo records when a shared connection fails.
- JSON export includes only records accessible to the signed-in account. Photo bytes are not included in shared exports; a separate authorized photo export tool is future work.

## Validation and limits

Run:

```sh
npm test
npm run check
npm run build
```

The database suite applies the actual migration to an isolated PGlite PostgreSQL engine with the PostGIS extension. The test harness supplies minimal Supabase Auth/Storage schemas and signed-in identities. It exercises real SQL transactions, geographic operations, grants and row-level policies. It does **not** replace a hosted Supabase acceptance test of email delivery, Storage HTTP behavior, deployment settings, or backups.

This phase includes groundwork for later delivery integrations; `delivery_attempts` has no browser write policy and no external submission worker yet. District signals summarize only the incidents an account may access, not a public census of all reports. There is no auto-import of local reports, no offline submission queue, no account-deletion flow, no image recognition, and no direct department submissions. Configure hosted backups, monitoring, signup/rate limits, and retention before a public pilot.
