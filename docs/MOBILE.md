# Civic Relay on your phone

Phones now use a full-width application layout. The desktop introduction, decorative handset, fake status bar and desktop navigation are hidden. Home, Report and My reports stay in the bottom navigation. The top-right menu opens Agency desk, Routing, account/connection and refresh controls. Agency permissions are unchanged, and phone queues use compact cards instead of a wide table.

Forms use readable text and larger touch targets. Headers, bottom navigation and dialogs account for device safe areas. Dialogs open as bottom sheets. Desktop browser windows keep the presentation layout. Smaller installed-app tablet windows also use the application layout.

## Open the update

1. Close Civic Relay's current home-screen window and reopen it while online. The interface update uses the same URL and needs no database migration.
2. If it still shows the old layout, reload the website in your phone's browser first.
3. If the shortcut launches with browser controls, open the published URL in Safari on iPhone, use Share → Add to Home Screen, and enable Open as Web App if that option appears. On Android, use the browser's Install app/Add to Home screen action.
4. Open the new icon and verify your account and reports before removing an older shortcut. An installed app can have a separate browser storage/session; reconnect the Supabase project and sign in if needed. Shared reports stay in Supabase. Export browser-local reports before removing an older installation or clearing site data.

The manifest specifies standalone display, a resident start screen and app icons; Apple metadata provides the home-screen title and app behavior. Browser/OS support determines the launch appearance. This is an installed mobile web app; no App Store package, Capacitor wrapper, service worker, offline loading or push notifications were added. It needs a connection to load the app and access shared reports or AI analysis. Existing browser-local storage behavior is unchanged.

## Verify on the presentation phone

Open from the home screen, check the notch/home-indicator spacing, open the keyboard and type a description, choose a photo, use GPS or the pin, confirm the routing sheet, save and track a report. Open the menu, sign in/switch accounts as appropriate, and verify staff-only agency access. Check portrait and landscape. The hosted website's access settings and Supabase sign-in still apply.

Browser checks cover phone layouts, fixed navigation, menu/account access, report routing/submission/status tracking, agency cards, icons/manifest and the retained desktop layout. Real-device home-screen launch, OS keyboard, camera permissions and safe-area rendering require the actual phone.
