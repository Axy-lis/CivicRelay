# Accounts and permissions

Phase 3 can be developed and demonstrated without connecting Supabase. It has a simulated identity preview for the presentation and a separate implementation for real accounts.

## Try the account demo now

Open **Accounts & database** (or the avatar in the resident phone), then choose:

| Identity | Demonstrated access |
| --- | --- |
| Resident — Alex Rivera | Submit reports, track owned incidents, see only their own evidence |
| Another resident — Jordan Lee | A separate set of owned sample reports |
| Water staff — Taylor Morgan | Water Services queue and status updates |
| Road staff — Casey Park | Public Works queue and status updates |
| Safety staff — Jamie Park | Demo Public Safety queue, status updates and deletion |
| Coordinator — Sam Chen | All sample incidents, including manual assignment of unassigned issues |

No password, sign-up, email, or external project is involved. The page banner always says **Account demo**, **Simulated identity**, and **Not real authentication**. The identity selector intentionally does not provide production security; anyone using that local sample workspace can switch identities. Its records use a distinct browser-storage key and never replace the original sandbox or shared database data.

A short demonstration:

1. Choose Resident and open My reports.
2. Open Agency desk to show that the resident cannot access agency tools.
3. Switch to Water staff, open CR-1041, and save a status update and note.
4. Switch back to Resident and open CR-1041 to show the update.
5. Choose Another resident to show separate report ownership.
6. Choose Coordinator and assign CR-1047 to a demo department.
7. Exit account demo to return to the original unrestricted sandbox.

## Real accounts after connection

Apply all five migrations in order, then connect the project as described in DATABASE-SETUP.md.

The real role rules are enforced in PostgreSQL. Frontend page guards are presentation and navigation controls, not the security boundary.

| Action | Resident | Assigned agency staff | Coordinator |
| --- | --- | --- | --- |
| Create a report | Yes | Yes | Yes |
| Read own reports | Yes | Yes | Yes |
| Read all evidence in an assigned incident | No | Yes | Yes |
| View another resident's private photo | No | Only for assigned incidents | Yes |
| Update incident status | No | Only for assigned incidents | Yes |
| Assign an incident to a department | No | No | Yes |
| Grant/remove agency membership | No | No | Yes |
| Create coordinator privileges through the UI | No | No | No |
| Edit another account's profile | No | No | No |

New accounts always begin as residents. Account metadata supplied at signup is never used as a role grant. A project owner must bootstrap the first coordinator directly through a trusted administrative connection. Users cannot promote themselves through signup or profile editing.

## Profiles and staff access

Signed-in users can edit their own display name and read their account ID. To become staff, they share their account ID with a coordinator. The coordinator opens **Manage agency access**, chooses a department, and grants access to that existing account. No public account-email lookup is provided. Removing access takes effect at the next database request; the app refreshes its permissions and closes outdated report details when access changes.

Membership changes record the coordinator, affected account, department, action, and time in `membership_history`. Repeated grants do not create duplicate assignments or duplicate audit events. Authenticated clients have no direct mutation permissions on that audit table.

Incident history records the acting account for staff review. Residents see their own actions as **You** and other actions as **Report update**. Other residents' names, email addresses, and account IDs are not exposed by that history view. Contact email remains in Supabase Auth. All status notes are resident-visible; internal-only notes are not part of this phase.

## Password and email flows

The account panel provides signup, sign-in, confirmation resend, password reset requests, and password updates. Passwords are sent only to Supabase Auth; the application never saves them in its own tables or browser preferences.

Allow the actual app origin and its recovery callback in Supabase Authentication URL settings, for example:

```text
https://YOUR_APP_HOST/
https://YOUR_APP_HOST/?auth=recovery
http://127.0.0.1:4173/
http://127.0.0.1:4173/?auth=recovery
```

A recovery link establishes a Supabase recovery session and opens the password form. The new password requires confirmation; the actual project password policy and any reauthentication rules remain enforced by Supabase. Configure a project-wide public connection in backend-config.js if links must work on devices that have not previously configured the database connection.

Reset and confirmation messages avoid claiming that an email address is registered. Hosted email delivery and recovery links need a real Supabase project; the no-backend identity preview does not send emails or pretend to authenticate users.

## Validation

Automated SQL tests apply the account migrations and subsequent feature migrations to isolated PostgreSQL/PostGIS and cover self-scoped profiles, resident/staff access, forbidden self-promotion, coordinator-only membership changes, audit privacy, and revoked photo/status access.

Browser checks cover simulated identities, separate ownership, department queues, status changes, coordinator assignment, account-demo persistence, and mobile layouts. Real-account screens are tested with simulated Supabase HTTP responses, not live credentials.

Hosted acceptance remains outstanding until a project is connected:

- Confirm signup and email verification.
- Complete a password-reset email round trip.
- Sign in as resident and assigned staff on different devices.
- Verify private photo access with actual Supabase Storage.
- Grant and revoke staff membership, then verify access from the affected account.
- Confirm sign-out and account switching clear protected report views.

## Safety report access

Safety reports are visible to their author, coordinators, and staff assigned to an active safety-capable agency. Water/road staff do not gain access through geographic proximity. Coordinators can assign safety reports only to agencies whose categories include `safety`. Staff membership and assignment are workspace administration, not evidence that an outside police agency received the report. Community duplicate lookup and district signals exclude safety reports. The simulated Safety staff account demonstrates this separation without authenticating a real user.
