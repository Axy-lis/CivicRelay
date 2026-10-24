# Non-emergency safety reporting

Choose **Suspicious activity** for non-emergency observations such as past property damage or a damaged bicycle lock. Describe observed actions, time, and place; do not infer wrongdoing from appearance or identity. Do not approach or follow anyone. For danger, injury, threats, or an incident needing an immediate response, use 911. Civic Relay is not monitored for emergencies and does not dispatch police. Saving here does not file a police report or notify law enforcement.

## Resident flow

1. Select the category, describe observations, and confirm the non-emergency acknowledgement.
2. Place the map pin or use location.
3. Read the destination pop-up. It shows a sourced contact candidate, a simulated assignment, or manual jurisdiction review. Change the location or continue to review. Changing category/location invalidates that acknowledgement.
4. Save and follow the private report in My reports. Use the linked official channel yourself if appropriate; eligibility and jurisdiction need confirmation.

The destination pop-up also appears for infrastructure reports. Suggested departments are labeled separately from actual assignments and no external delivery is implied.

## Contact coverage

Checked October 24, 2026. Entries are in `dist/safety.js` and migration 005. Phone numbers are shown only where the cited source identifies a suitable non-emergency contact. County directories apply only when the pin is outside incorporated cities; contract-city coverage is not inferred. Within the geographic boundary review buffer, no automatic candidate is offered.

| Area | Official source |
| --- | --- |
| Los Angeles city | [LAPD contact](https://www.lapdonline.org/contact-us/) |
| San Diego city | [SDPD reporting](https://www.sandiego.gov/police/services/file-police-report) |
| Unincorporated Los Angeles County | [LASD directory](https://lasd.org/lasd-phone-directory/) |
| Unincorporated Orange County | [Sheriff contact](https://www.ocsheriff.gov/contact-us) |
| Unincorporated Riverside County | [Who to call](https://www.riversidesheriff.org/428/Who-to-Call) |
| Unincorporated San Bernardino County | [Sheriff department](https://wp.sbcounty.gov/sheriff/) |
| Unincorporated San Diego County | [Sheriff reporting](https://www.sdsheriff.gov/i-want-to/report) |

Other areas remain in manual jurisdiction review. Broad SoCal geographic coverage does not imply comprehensive police routing coverage.

## Data and staff behavior

Safety reports require explicit consent in both the browser and database. They cannot support/join existing incidents, are absent from community duplicate suggestions, and do not contribute to congressional district signals. Residents see their own evidence. Appropriate assigned safety staff and coordinators can review, update, track, export, and delete according to existing permissions. Safety assignment is limited to active agencies with the `safety` category. Shared deletion retains restricted evidence and audit history under migration 004 rules. Local browser storage and simulated accounts are presentation tools, not real authentication.

## Enable and verify

If migrations 001–004 are already applied, run only `supabase/migrations/202610240005_safety_reporting.sql` in Supabase SQL Editor. No geography reimport is required. New projects apply all five in order, then import SoCal data.

Automated checks cover real PostgreSQL/PostGIS routing parity, consent rejection, permissions, assignment restrictions, duplicate exclusion, tracking, photo access, audit history, deletion, and compatibility with existing infrastructure submissions. Browser checks cover the destination dialog, consent, location changes, phone layout, saving, staff filters, status changes, export and simulated identities. Hosted email and Storage behavior still need verification against your actual Supabase project.

For hosted acceptance, submit as a resident; verify another resident and water staff cannot see it; assign to a safety-capable agency as coordinator; verify assigned staff can update it and the resident sees the update. Confirm it never appears in duplicate suggestions or district signals. Delete as authorized staff and check that active views hide it.
