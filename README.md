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

**Local demo** works immediately. It keeps reports in your browser, uses fictional sample service areas and incidents, and lets you explore both resident and agency workflows without an account.

**Shared workspace** connects the same interface to Supabase PostgreSQL/PostGIS, Auth, and private photo storage. Select **Connect database** after setting up your project. Shared records never fall back to local samples and local reports are not uploaded automatically.

Follow [Database setup](docs/DATABASE-SETUP.md) to create the hosted project, apply the migration, configure authentication, assign staff access, and verify cross-device reporting. You can prepare the app without credentials; a live database connection requires your own project URL and publishable key.

## Implemented

- Resident photo reporting, JPEG compression, category/description entry, GPS with independent timeout and cancellation, manual coordinates, and sample locations.
- Local geographic fixtures plus server-side PostGIS routing in shared mode.
- Nearby duplicate suggestions with resident confirmation; multiple supporting reports attach to one incident.
- Searchable agency queue, status history, coordinator assignments, JSON export, and district signals.
- Shared report transactions with idempotent request keys, revision checks, private attachments, upload retries, and periodic/manual refresh.
- Email/password account flows and database-enforced resident, agency-member, and coordinator access.
- Separate shared test/live environments; fictional fixtures are excluded from live routing.

## Demo sequence

1. Start in local mode and select Report an issue.
2. Choose Water leak, describe the issue, and optionally upload a photo.
3. Select Willow corner for a nearby-incident suggestion, or enter separate coordinates.
4. Confirm the routing and submit a new report or supporting evidence.
5. Switch to Agency desk, open the incident, and update its status.
6. Return to My reports and view the history.
7. After database setup, repeat in shared mode using separate resident and assigned-staff accounts on different devices.

## Current limits

All provided geographic fixtures, agency names, districts, and sample incidents are fictional. Real SoCal service areas and intake channels still need verified data. Reports outside shared live coverage are saved for coordinator review.

External agency delivery and notifications, image recognition, internal-only notes, and local-to-cloud import are not implemented. The delivery-attempts table is groundwork for later integrations. All status notes are resident-visible. District signals summarize only records accessible to the current account.

Local and shared data have separate storage. Clearing browser data deletes local demo records and connection/session preferences, but not records already saved in the database. Shared photo bytes are not included in JSON exports. Private photos are displayed using temporary signed URLs.

The database tests run the actual SQL against isolated PGlite PostgreSQL/PostGIS with minimal Auth/Storage fixtures. Hosted Supabase email, Storage HTTP behavior, deployment configuration, and backup settings require the acceptance checks in the setup guide before a real pilot.

## Location troubleshooting

Requests stop after 15 seconds, explain failures, and support retry/cancel. If an embedded preview cannot request permission, open the HTTPS demo in Safari or Chrome and allow location. On Mac also check System Settings → Privacy & Security → Location Services. This website cannot enable permissions for its host browser. A correctly detected location may be outside available service areas.

## Files

- `dist/`: responsive app, local reporting engine, location helper, workspace UI, and public connection defaults.
- `src/cloud-client.js`: Supabase API, authentication, and photo-storage adapter.
- `scripts/build.mjs`: bundles the shared client into `dist/cloud-client.js`.
- `supabase/migrations/`: database tables, geographic indexes, RLS, RPCs, and private storage policies.
- `supabase/seed.sql`: explicitly optional fictional routing fixtures.
- `tests/`: reporting, location, client, and PostgreSQL/PostGIS integration tests.
- `docs/DATABASE-SETUP.md`: deployment and acceptance-test guide.

Source repository: https://github.com/Axy-lis/CivicRelay

The local working copy is in this chat's workspace because macOS blocked the selected Documents folder. Copy the complete project folder or extract the project ZIP into a folder of your choice. Never copy `node_modules`, `.git`, or secret environment files when sharing source.
