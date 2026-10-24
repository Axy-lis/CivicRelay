# Civic Relay: remaining product work

The resident workflow, draggable pin, local report tracking, agency dashboard, duplicate handling, account demos, and first SoCal geographic dataset are implemented. Supabase integration and permissions are coded and tested locally, but hosted acceptance on the user's project remains to be verified. Geographic coverage is broader than verified department and delivery coverage.

## Completed in this update

- [x] Add a destination pop-up before resident review and saving.
- [x] Add non-emergency suspicious-activity reporting across local/shared submission, routing, scoped staff access, tracking, assignment, status, evidence, category filters, export, and deletion.
- [x] Exclude safety reports from community duplicates and district signals; provide seven sourced contact handoffs with manual jurisdiction review elsewhere.

## Demo-ready priorities

- [ ] Connect a hosted Supabase project, apply all migrations, import SoCal data, and configure authentication/email/private photo storage.
- [ ] Verify resident-to-staff-to-resident updates across devices, real account permissions, and private photo access on the hosted backend.
- [ ] Add street imagery / a street basemap behind the draggable pin so residents can identify roads, intersections, and landmarks. Choose a suitable map provider; configure attribution, public-key restrictions, and usage limits. Treat optional satellite or street-level photography as separate provider capabilities.
- [ ] Add street-address search and confirm the final pin location rather than using a city's representative point as an address.
- [ ] Expand the verified agency directory; fill water-provider gaps and verify road, highway, streetlight, and private-asset ownership. Keep uncertain matches in review. See docs/SOCAL.md.
- [ ] Implement backend photo analysis with protected credentials, editable category/description suggestions, an unclear-result option, and a manual fallback. Evaluate damage highlights separately; test representative held-out photos.
- [ ] Implement requested description-based suggestions for Other: explain the evidence, allow accept/change/keep Other, and combine the issue type with verified local routing.
- [ ] Finish staff tracking: internal versus resident-visible notes, district/category/age/agency filters, assignment audit, and external ticket/delivery states when implemented.
- [ ] Prepare permission-cleared photos, verified demo locations, repeatable sample data, and a recorded walkthrough with clearly labeled simulated actions and backup footage.

## Agency delivery and escalation

- [ ] Obtain approved agency channels/credentials and build the first supported connector.
- [ ] Map service codes and required fields; save receipts/ticket IDs, prevent duplicate retries, and handle errors/status synchronization.
- [ ] Distinguish saved in Civic Relay, sent, accepted, and resolved. Provide official-form handoffs where direct delivery is unavailable.
- [ ] Verify congressional office recipients/channels, maintain term-specific district data, and prevent repeat notifications for unchanged alerts. Until then, elected-office notifications remain simulated.

## Reliability and release

- [ ] Test real-device camera/GPS permission handling, poor connections, interrupted uploads, retries, accessibility, and mobile layouts.
- [ ] Configure production monitoring, backups, rate/usage limits, retention, privacy/account deletion, and recovery procedures.
- [ ] Decide whether to support offline drafts and queued uploads; never imply an offline report was delivered.
- [ ] Keep setup instructions, source downloads, and feature/simulation labels current.
- [ ] Establish the preferred permanent working folder and backup workflow; current durable source remains in the chat workspace.

## Mobile application path (planned, not implemented)

- [ ] Adapt the resident experience to a full-screen mobile layout without the decorative phone frame or desktop navigation; retain the agency dashboard as a web interface.
- [ ] Add Capacitor to reuse the existing web build in iOS and Android projects.
- [ ] Integrate/test native camera/photo selection and geolocation permissions, authentication redirects, protected session storage, app resume behavior, and network failures.
- [ ] Add app identity, icons, launch screens, safe-area handling, and platform configuration.
- [ ] Build and test on actual devices using Xcode and Android Studio; distribute test builds before a store release.
- [ ] Prepare developer accounts, signing, screenshots, privacy disclosures, and platform review requirements for App Store/Google Play distribution.
- [ ] Optionally add a PWA installation path first; browser installation is distinct from native store packaging and does not add backend synchronization by itself.

The demo-ready milestone is shared report persistence, honest location-based routing, useful photo/text suggestions, resident-visible staff updates, and a repeatable recorded workflow. Region-wide automatic agency submission is a later expansion unless its connections are verified.
