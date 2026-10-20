# Civic Relay

A working first-pass infrastructure reporting prototype. The resident app is displayed inside a phone frame; the agency desk and routing explorer are desktop-friendly and responsive.

## Run

Requires Node.js 20+ for checks and Python 3 for the local static server. No application dependencies or build step.

```
npm start
```

Open http://127.0.0.1:4173. Start a separate terminal for `npm test` and `npm run check`.

## Implemented

- Resident reporting: photo upload, compression, category selection, description, GPS or manual coordinates, demo location presets, review, and local submission.
- Geographic routing: point-in-polygon checks against explicit fixture boundaries, category-to-department matching, deterministic boundary handling, and manual review fallback.
- Nearby issue suggestions: same category, unresolved, within 60 meters; residents choose whether to attach supporting evidence.
- Agency desk: searchable queue, department/status filters, evidence viewer, editable statuses, notes, history, manual department assignment, JSON export, and sample reset.
- District signals: at least three distinct unresolved incidents in a demo district/category over the last seven days. Supporting reports do not inflate incident counts.
- Persistence in this browser using localStorage. Updates appear in both views and other tabs on the same origin.

## Demo sequence

1. In Resident app, select Report an issue.
2. Choose Water leak, optionally upload a photo, and describe the issue.
3. Select Willow corner to match an existing sample incident, or use custom coordinates for a separate incident.
4. Review the routed department. Attach to an existing incident or submit a separate issue.
5. Switch to Agency desk, open the incident, and save a status update and note.
6. Return to My reports and open the report to see the update.
7. Use Routing to compare west/east service areas and out-of-coverage behavior.

## Explicit prototype limitations

All service areas, districts, department names, and seed incidents are fictional. Coordinates use an example area near San Jose, but the rectangular fixtures are not official city, utility, or congressional boundaries. Replace them with verified and category-specific service boundaries before real routing.

This version has no cloud database, authentication, role enforcement, image recognition, external submission, email, or elected-official notifications. Agency controls are deliberately available to the demo visitor. Do not deploy it as an authenticated agency service without adding server-side access control and a shared database.

Records and images stay in localStorage for this origin/browser. Other devices, private browsing, localhost, and the published domain each have independent data. Clearing browser data removes reports. Large datasets may exceed storage limits; failed saves are reported and do not claim success. Export JSON to retain a copy; import is not implemented. Simultaneous tab edits use last-write-wins semantics.

Camera/file selection and geolocation depend on browser permission and support. An uploaded photo does not supply its location automatically. Online fonts are optional; the UI falls back to system fonts. The app does not call an image model or send photo contents to an AI service.

## Structure

- `dist/index.html`: application shell.
- `dist/styles.css`: responsive phone and agency interface.
- `dist/app.js`: resident workflow, persistence, dashboard, and routing explorer.
- `dist/core.js`: geographic routing, duplicate suggestions, alert rules, and submission logic.
- `tests/core.test.js`: routing boundaries, fallbacks, duplicate handling, validation, submission integrity, and alert counting.

Created in the chat workspace because macOS blocked access to the selected Documents folder. The entire project directory can be copied to that folder later.

## Saving the project elsewhere

Copy the complete `civic-relay` folder into your desired folder in Finder. Alternatively, extract the accompanying `civic-relay-project.zip` there. The source archive contains the app, tests, run instructions, and hosting manifest; it excludes Git history and local tooling state. The hosting manifest still points to the existing private Site, so keep it if continuing the same project.

Your submitted reports and photos live in browser storage, not in the source folder or ZIP. To save those too, use **Agency desk → Export records**. Import is not implemented.

## Current location troubleshooting

Location requests have an independent 15-second watchdog in addition to the browser's own timeout. The browser's timeout does not cover all time spent waiting for permission; an embedded preview may also fail to return either callback. Requests now end with specific guidance and allow retry or cancellation. Choosing a sample, editing coordinates, or leaving the location step cancels pending results so a late callback cannot replace your choice.

If the preview cannot provide location, open the HTTPS demo URL directly in Safari or Chrome and allow the website's location request. On Mac, also check **System Settings → Privacy & Security → Location Services** for your browser. This website cannot enable OS permissions or add location capability to its host app. If location is still unavailable, select a sample or enter coordinates manually. A successfully detected real location may be outside the fictional service areas and will then require routing review.
