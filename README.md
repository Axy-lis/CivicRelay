# Civic Relay

An infrastructure reporting app with a phone-style resident interface, geographic routing, and an agency dashboard.

## Start locally

Requires Node.js 22+ and Python 3. Install dependencies, then launch:

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. The build bundles the Supabase browser client locally; no external JavaScript CDN is required.

```sh
npm test
npm run check
npm run build
```

## Modes

**Local SoCal workspace** works immediately. It keeps reports in your browser, uses official county, city, congressional and verified water-service polygons, and begins empty. Suggested department contacts require ownership review before assignment. The separate account demos retain fictional fixtures.

**Shared workspace** connects the same interface to Supabase PostgreSQL/PostGIS, Auth, and private photo storage. Open **Accounts & database** to try a demo identity, or configure a real connection after setting up your project. Shared records never fall back to local samples and local reports are not uploaded automatically.

Follow [Database setup](docs/DATABASE-SETUP.md) to create the hosted project, apply the migration, configure authentication, assign staff access, and verify cross-device reporting. You can prepare the app without credentials; a live database connection requires your own project URL and publishable key.

## Implemented

- Report intelligence: automatic local description hints for Other, plus opt-in photo/description AI suggestions through an authenticated server function. [Enable live analysis](docs/INTELLIGENCE.md).
- Full-width mobile resident interface with fixed bottom navigation, touch-sized forms, mobile workspace menu, responsive agency cards and home-screen app metadata/icons. See [Phone setup](docs/MOBILE.md).
- Resident photo reporting, JPEG compression, category/description entry, GPS with independent timeout and cancellation, manual coordinates, and sample locations.
- Real SoCal geography across ten counties, city search, movable map pin, sourced intake suggestions, boundary review, and server-side PostGIS import/routing. See [SoCal coverage](docs/SOCAL.md).
- Destination pop-up before review, with suggested contacts and clear manual-review fallbacks.
- Non-emergency suspicious-activity reports with explicit confirmation, private tracking, scoped safety-staff access, and sourced contact handoffs. See [Safety reporting](docs/SAFETY-REPORTING.md).
- Nearby duplicate suggestions with resident confirmation; multiple supporting infrastructure reports attach to one incident. Safety reports are excluded from community duplicates and district signals.
- Searchable agency queue, status history, coordinator assignments, report deletion with confirmation, category filtering, JSON export, and district signals.
- Shared report transactions with idempotent request keys, revision checks, private attachments, upload retries, and periodic/manual refresh.
- Email/password account flows and database-enforced resident, agency-member, and coordinator access.
- Separate shared test/live environments; fictional fixtures are excluded from live routing.

## Phase 3 accounts

Open **Accounts & database** and choose a resident, water staff, road staff, safety staff, or coordinator identity. These are explicitly simulated, require no Supabase project, and use a separate sample dataset. Residents see their own evidence, staff see department-specific queues, and coordinators can assign unassigned reports. The local SoCal workspace is available through **Exit account demo**.

For real accounts, sign-in/sign-up, profile editing, confirmation resend, password recovery, and password changes are implemented. Roles come from the database. Coordinators can grant or remove agency membership using an existing account ID; the UI cannot create coordinator privileges. Status updates and membership changes have server-side audit records.

See [Accounts and permissions](docs/ACCOUNTS.md) for the role matrix, demo walkthrough, and hosted acceptance checklist. Apply all six SQL migrations in order and import the SoCal dataset when connecting a real project.

## Demo sequence

1. Start in local mode and select Report an issue.
2. Choose Water leak, describe the issue, and optionally upload a photo.
3. Select Los Angeles, search a city and adjust the pin, use GPS, or enter coordinates.
4. Confirm the destination pop-up, review the provider, official contact, district and sources, then save the report.
5. Switch to Agency desk, open the incident, and update its status.
6. Return to My reports and view the history.
7. After database setup, repeat in shared mode using separate resident and assigned-staff accounts on different devices.

## Current limits

Real geographic coverage is available for ten SoCal counties, 235 incorporated cities/towns, 35 intersecting current congressional districts, and 612 verified active water systems. Department intake coverage is partial (9 local infrastructure entries, 2 water contacts, and 7 non-emergency safety contacts). Every real report remains in ownership review until a coordinator assigns it. Detailed road/light ownership inventories and address geocoding remain Phase 4 work. Fictional fixtures are confined to explicitly simulated account and shared test workspaces. See [coverage details and remaining work](docs/SOCAL.md).

External agency delivery and notifications, precise visual damage overlays, internal-only notes, and local-to-cloud import are not implemented. Live AI analysis requires the separate function/secrets setup; it is not enabled by the website deployment. The delivery-attempts table is groundwork for later integrations. All status notes are resident-visible. District signals summarize only records accessible to the current account.

Local and shared data have separate storage. Clearing browser data deletes local demo records and connection/session preferences, but not records already saved in the database. Shared photo bytes are not included in JSON exports. Private photos are displayed using temporary signed URLs.

The database tests run the actual SQL against isolated PGlite PostgreSQL/PostGIS with minimal Auth/Storage fixtures. Hosted Supabase email, Storage HTTP behavior, deployment configuration, and backup settings require the acceptance checks in the setup guide before a real pilot.

## Location troubleshooting

Requests stop after 15 seconds, explain failures, and support retry/cancel. If an embedded preview cannot request permission, open the HTTPS demo in Safari or Chrome and allow location. On Mac also check System Settings → Privacy & Security → Location Services. This website cannot enable permissions for its host browser. A correctly detected location may be outside available service areas.

## Files

- `dist/`: responsive app, local reporting engine, location helper, workspace UI, and public connection defaults.
- `src/cloud-client.js`: Supabase API, authentication, and photo-storage adapter.
- `scripts/build.mjs`: bundles the shared client into `dist/cloud-client.js`.
- `supabase/migrations/`: database tables, geographic indexes, access policies, reporting functions, profiles, staff administration, and audit attribution.
- `supabase/seed.sql`: explicitly optional fictional routing fixtures.
- `tests/`: reporting, location, client, and PostgreSQL/PostGIS integration tests.
- `docs/DATABASE-SETUP.md`: deployment and acceptance-test guide.

Source repository: https://github.com/Axy-lis/CivicRelay

The local working copy is in this chat's workspace because macOS blocked the selected Documents folder. Copy the complete project folder or extract the project ZIP into a folder of your choice. Never copy `node_modules`, `.git`, or secret environment files when sharing source.

Projects already on migration 004 need only `supabase/migrations/202610240005_safety_reporting.sql` for safety reporting; no geographic reimport is required. Migration 004 enables dashboard deletion. Assigned staff and coordinators may delete reports from active views; shared evidence and audit records are retained. See the database setup guide for details.

Photo/report intelligence setup is documented in [INTELLIGENCE.md](docs/INTELLIGENCE.md). Existing projects on migration 005 need only migration 006 and the analysis function/secrets, with no geography reimport.

The analysis function now uses Google Gemini; configure `GEMINI_API_KEY` in Supabase server secrets and redeploy `analyze-report`. Existing migration 006 remains sufficient. See [intelligence setup](docs/INTELLIGENCE.md).
