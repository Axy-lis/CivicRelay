# Photo and report intelligence

The resident form now has a Report intelligence card. Selecting Other automatically shows a conservative, browser-local description hint for supported issue types. It is labeled Local rules and requires no key, connection, or data transfer. AI photo and description analysis use an authenticated Supabase Edge Function. They require the setup below and are not enabled by publishing the static website alone.

## What the first version does

- Photo analysis suggests water, road, lighting, or Other; lists observations and limitations; and drafts an editable description.
- Description analysis suggests the category and generic department type from the supplied facts.
- Nothing changes automatically. Use this category and Use draft description are separate actions. Manual choices always remain available.
- The confirmed category goes through the existing location-based routing, destination pop-up, submission, staff queue, tracking and export. The model does not invent department names or replace service-boundary rules.
- Ambiguous or conflicting evidence returns Other / Needs your review. Qualitative certainty is not a calibrated probability.
- Analysis does not identify people, decide whether someone is suspicious, or select law enforcement from a photo. The Suspicious activity category remains a manual non-emergency flow.
- Editing inputs or canceling discards pending results. Errors preserve the resident's draft. There is no automatic paid retry.

This is classification and drafting, not a damage detector with precise bounding boxes. Damage overlays, model accuracy evaluation, multilingual tuning and production monitoring remain follow-up work. AI provenance is not yet stored as a separate audit record; only the resident's final category/description are submitted.

## Enable live AI in your Supabase project

You need your own OpenAI API project/key with API billing and model access. Put the key only in Supabase server secrets, never in frontend files, the database connection form, GitHub, or this chat. A ChatGPT sign-in is not supplied to the model endpoint by this application.

1. In Supabase SQL Editor, run migrations 001 through 005 if they are not already applied. In particular, 004 must run before 005. For an up-to-date project, run only `supabase/migrations/202610240006_report_intelligence.sql`. Do not rerun earlier migrations or the geography import.
2. In your Supabase dashboard, open **Edge Functions → Secrets** and add:

   | Name | Value |
   | --- | --- |
   | OPENAI_API_KEY | Your secret OpenAI API key |
   | OPENAI_MODEL | `gpt-5.6-terra` (optional; this is the default) |
   | ALLOWED_ORIGINS | `https://civic-relay-vinay-1019.animalargovindan.chatgpt.site,http://127.0.0.1:4173` |

   Origins must match exactly, without trailing slashes. Keep the published Site's owner-private sharing setting as desired; that is separate from Supabase account access. Standard Supabase URL and public API key environment variables are provided by Supabase. This function uses no service-role key.
3. In a terminal opened inside the complete Civic Relay project folder, run:

   ```sh
   npx supabase login
   npx supabase functions deploy analyze-report --project-ref YOUR_PROJECT_REF
   ```

   Replace `YOUR_PROJECT_REF` with the reference from your Supabase project settings (the identifier in the project's `.supabase.co` URL). Deploy from the project root so the `_shared/analysis.js` and `_shared/contract.js` imports are included. Keep JWT verification enabled; `supabase/config.toml` declares it. The function also verifies the current user through Supabase Auth.
4. Refresh Civic Relay, connect your Supabase URL/publishable key as before, and sign into your real resident account.
5. Upload a JPEG/PNG/WebP photo. The app compresses it to JPEG. Check the consent box and select **Analyze photo**. Review the observations; apply the category and/or draft description only if they match what you saw. Confirm the actual location, inspect the routing pop-up and save.
6. Test **Other** with “A large pothole near the intersection.” The local hint appears immediately; **Analyze description** requests a model suggestion after consent. Description-only requests do not send the uploaded photo.

If the function is missing, deploy it. If it reports migration 006 missing, apply that migration. A 401 means the session or function authentication needs checking: sign in again and inspect Supabase function logs without disabling user verification. A browser network/CORS error can mean the app origin is missing from ALLOWED_ORIGINS. A provider usage error requires checking OpenAI API billing/model access. Do not copy tokens, keys, photos or report descriptions into logs or screenshots shared for troubleshooting.

## Data flow and limits

Only the compressed photo (photo mode) and description are sent for model analysis after consent. No pin coordinates, account identifiers, Auth email or resident-selected department are included in the OpenAI request. Photos and text may themselves contain personal or location information; consent does not remove that content. The authenticated request to Supabase carries the resident session as usual. The function forwards content to OpenAI, requests `store: false`, and does not write analysis content to the report database or logs. This setting is not a promise about all provider retention: review your provider's applicable data policy before a public pilot.

The function validates same-project users, checks an explicit origin allowlist for browser calls, bounds streamed bodies and JPEG content, and uses strict structured output plus local validation. It accepts no remote image URL. Auth and provider requests have timeouts; canceling in the browser prevents a stale result from being applied but may not cancel provider processing or charges already started.

Migration 006 enforces an atomic per-user budget of 20 attempts per UTC day, at least three seconds apart. Failed provider requests count as attempts. This is a demo guard, not a complete abuse/cost control system. Set provider project budgets/alerts and signup controls; add account-independent limits and monitoring before public access. Quota records store only user ID, UTC day, count and last request time. The underlying table is private and browser users have no direct read/write grants.

## Verification and remaining acceptance

Automated tests exercise request validation, auth, origins, quotas, provider errors, incomplete/refused output, response validation, category ambiguity and negation, and private per-user budgets in PostgreSQL. Browser checks exercise local hints through real geographic routing, consent, mocked model suggestions, applying/editing drafts, photo encoding, stale-result rejection, cancellation, manual fallback and phone layout. These checks do not measure real model accuracy.

After you enable the function, try permission-cleared photos of a pothole, leaking pipe, healthy pavement, ambiguous puddle, and a daytime streetlight. Include unrelated photos and conflicting descriptions. Check that uncertain results do not claim established damage or ownership. Record accuracy on a separate held-out set, latency and actual costs before the presentation. Hosted inference and real-image quality remain unverified until your API key and function are configured.

Implementation follows [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [the configured model's capabilities](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Supabase function authorization](https://supabase.com/docs/guides/functions/auth-headers), and [server secrets](https://supabase.com/docs/guides/functions/secrets).
