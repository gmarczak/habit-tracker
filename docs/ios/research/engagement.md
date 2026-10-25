# Notatki badawcze: Powiadomienia, widżety, Siri

_Materiał źródłowy do `docs/ios/PLAN.md` (stan na 2026-10-25, po angielsku). Gdy plan i notatki się różnią, obowiązuje plan._

## Summary

- Every native goal (interactive widget, the "Zrobione" notification action, HealthKit background sync, Screen Time detection, App Intents/Siri) is Swift code that runs in an extension or a background launch, with no web view involved. The container choice (Capacitor, SwiftUI or hybrid) only decides who draws the in-app screens. Capacitor saves about 0 days on those features.
- The web app is already effectively client-rendered. Every page under `app/(app)` is a thin wrapper around a client component. All data goes browser → Supabase via `supabaseBrowser()`. The server only does the `proxy.ts` redirect, `/auth/callback`, `/api/log` and `/api/ingest`. So the hosted site runs as-is in a WKWebView pointed at https://nawyki.gmarczak.xyz with first-party cookies. A bundled static export would break `proxy.ts`, the route handlers, `habits/[id]` and the default `next/image` loader (see the Next 16 static-export docs in node_modules).
- In WKWebView: Web Push does not work at all (Apple DTS), so reminders must move to APNs from the existing send-reminders function. Service workers (the offline shell in `public/sw.js`) need App-Bound Domains. IndexedDB and the TanStack offline queue persist in the default data store. Safe areas already work because of `viewportFit: cover` and `env(safe-area-inset-*)`.
- Capacitor (8.5.3 stable, 9.0.0-alpha.8 on npm) is a poor fit. Its own config docs call `server.url` "not intended for use in production". Its JS plugins can't be relied on during HealthKit or notification background launches. You'd write all four extensions in Swift anyway and also maintain Capacitor's project and notification glue.
- A full SwiftUI rewrite (about 40–50 dev-days) would permanently double the UI and the domain logic: streaks, "never miss twice", weekly plans, day_start_hour. The PWA must stay alive, and the owner ships Today-screen changes almost daily. Rejected.
- Recommendation: a hybrid, built step by step. Phase 1: a SwiftUI app whose main screen is a WKWebView hosting the live site, plus native widget, notification actions, HealthKit, App Intents and APNs. Phase 2 (optional): a native SwiftUI Today/quick-check/yesterday-review that only displays server-computed data.
- Auth: extensions and background code should use a per-device bearer token, extending the existing `ht_` token infrastructure, not a Supabase session shared through the Keychain. Supabase reuse detection revokes the whole session if two processes rotate the refresh token out of order. The token needs no refresh, survives a 9-day silence and can be revoked per device. The WebView keeps its own cookie session (one password login).
- Keep the logic in TypeScript. A token-authenticated "day view" endpoint computed with `lib/domain` (the same code send-reminders already bundles) means the widget, notifications and the Phase 2 Today screen are plain renderers, with no Swift port of the streak rules.
- Effort: about 16–20 dev-days to get the widget, the "Zrobione" action, HealthKit auto-checking, APNs reminders and Siri/Control Center intents. Phase 2 adds 5–7 days. Screen Time detection adds 2–3 days, and it's uncertain whether the needed permission covers anything beyond builds installed straight from Xcode.
- Things to fix first: `api_tokens` allows one token per user (primary key is `user_id`), so regenerating the key in Settings would silently disconnect the app — move to a per-device table first. Reminders would arrive twice if the PWA and the native app stay installed on the same iPhone. Lock-screen widget taps only run after Face ID unlock. HealthKit can't be read while the phone is locked, and step updates arrive at most hourly.

## Recommendation

Build option 3, the hybrid, in phases. Use a native SwiftUI app with a plain WKWebView (UIViewRepresentable, not Capacitor) that loads https://nawyki.gmarczak.xyz for every screen at first. Next to it, put a shared Swift package "NawykiKit" used by four targets: the app, a WidgetKit extension, an App Intents/Controls surface and, later, a DeviceActivity monitor. All native code authenticates with one per-device bearer token stored in a shared Keychain access group. Writes go straight to token-checked Supabase RPCs. Computed views come from a new `/api/native/day` route that reuses lib/domain. Reminders move to APNs (with categories and a background "Zrobione" action) from the existing send-reminders function, while Web Push stays for the PWA. Only after living with Phase 1 for a few weeks, decide whether the Today/yesterday-review screen justifies a native SwiftUI version that displays the same day-view JSON. Widget, notifications and HealthKit should take most daily logging out of the app, so it may never be needed. Don't use Capacitor (unsupported `server.url`, no background JS, framework churn). Don't do a full rewrite (two full UIs and two copies of the domain logic, forever).

## Effort

Recommended path: Phase 0 backend 3.5–4.5 days + Phase 1 (SwiftUI shell with WebView, widget, Zrobione action, HealthKit, APNs, App Intents) 12–15 days = about 16–20 days. Optional Phase 2 native Today/review 6–8 days. Optional Screen Time detection 2–3 days. For comparison: Capacitor server.url about 16–20 days, Capacitor bundled about 20–25 days, full SwiftUI rewrite about 40–50 days, hybrid end-state about 22–28 days.

## Details

# App architecture for "Nawyki" on iOS

## 0. What the repo tells us (grounding)

| Fact in code | Consequence for native |
|---|---|
| `app/(app)/*/page.tsx` are thin wrappers around client components; `lib/data/snapshot.ts` fetches everything in the browser with `supabaseBrowser()` (`lib/db/client.ts`, `@supabase/ssr` createBrowserClient → cookie storage) | The hosted site needs no SSR data. It renders the same in a WKWebView as in Safari. |
| Server-only pieces: `proxy.ts` (getClaims + redirect to `/login`, cookie refresh via `Set-Cookie`), `app/auth/callback/route.ts`, `app/api/log`, `app/api/ingest` | Static export (Capacitor bundled mode) breaks all of them. The Next 16 docs (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`) list Proxy, Route Handlers, Cookies, dynamic routes without generateStaticParams (`habits/[id]`) and default-loader `next/image` (used in `LoginForm.tsx`) as unsupported. |
| `app/providers.tsx`: TanStack Query + idb-keyval persister, paused `entry` mutations survive restarts, SW registered only in production | Works in WKWebView: the IndexedDB of the default `WKWebsiteDataStore` persists. The SW needs App-Bound Domains. |
| `public/sw.js`: offline shell + `push` + `notificationclick` | Push handlers never fire in WKWebView. The offline shell works only with App-Bound Domains. |
| `features/reminders/push.ts` `pushSupport()` returns `ios-needs-install` when not standalone; `LoginForm.tsx` `useStandalone()` | Inside the native WebView the app would tell the user to "add to home screen". Needs a native-shell branch. |
| `supabase/migrations/20261023120000_health_ingest.sql`: `api_tokens.user_id` is the **primary key**, SHA-256 hash only, used by `token_owner`/`log_habit`/`ingest_metrics` (security definer, anon-callable) | Good base for native credentials, but only one token per user: generating a new key disconnects every other client. Must become per-device. |
| `supabase/functions/send-reminders/src.ts` bundles `lib/domain` and loads a user's habits/plans/entries/pauses with the service role; `logic.ts` `Message` has `url`, `badge` but no habit ids | The same pattern can serve a "day view" for native. APNs payloads need `habitIds` and `date` for actions. |
| `features/today/SwipeRow.tsx`, `HabitRow.tsx` use pointer swipes / long-press | Turning on WKWebView edge back-swipe would fight row swipes. Keep it off. |
| Git log: 28 PRs in 2 weeks, mostly Today/review behaviour | Duplicating Today natively is the costliest duplication. Keep logic server-side and the native UI thin. |

## 1. Option comparison

### Option 1a: Capacitor shell with `server.url` → hosted Next.js
**Works as-is:** cookie auth (first-party origin in the WKWebView cookie store), `proxy.ts` redirects, client data, IndexedDB queue, safe areas (`viewportFit: cover` + `env(safe-area-inset-*)` already used; set `contentInset: 'never'`/default and a matching `backgroundColor` to avoid a white flash).

**Breaks or needs work:**
- `server.url` is documented as "Load an external URL… intended for use with live-reload servers. **This is not intended for use in production.**" (Capacitor `cli/src/declarations.ts`). For a personal, sideloaded app App Review doesn't matter, but you are on an unsupported path.
- Service worker / offline cold start: requires `WKAppBoundDomains` in Info.plist (max 10 domains) + `ios.limitsNavigationsToAppBoundDomains: true`. That blocks navigation to any non-listed domain, and once the key exists other web views lose JS injection, cookie access and message handlers. Without it, an offline launch shows a load error.
- Web Push: an Apple DTS engineer states that "Web Push Notifications will not work in apps with a WKWebView… Service Workers work fine". You need APNs via `@capacitor/push-notifications` plus an APNs sender server-side.
- The "Zrobione" action, HealthKit background delivery and widget intents run in background launches or extension processes. JS plugin listeners can't be relied on there, so all of it is Swift inside Capacitor's Xcode project. You also need extra glue because Capacitor's push plugin sits in the notification delegate path.
- Web changes: native detection, push and login branches, hiding Shortcut instructions. The same as in the recommended path.
- Login: magic links open Safari (separate cookie jar). Already handled by the `?error=browser` message, so password only.

**Effort:** about 16–20 days, the same as the recommendation, because the expensive parts are native anyway. **Maintenance:** one UI, but a yearly Capacitor major (8.5.3 now, 9.0.0-alpha.8 already on npm `next`) plus Xcode upgrades, for a framework whose value here is close to zero.

### Option 1b: Capacitor with a bundled static export
Everything in 1a, plus:
- a second build target with `output: 'export'`;
- `proxy.ts` replaced by a client-side guard;
- `habits/[id]` changed to `?id=`;
- `searchParams` server pages (`review`, `login`) moved to `useSearchParams`;
- `next/image` set to unoptimized;
- auth storage moved from `document.cookie` on `capacitor://localhost` to localStorage/Preferences;
- CORS for `/api/*`;
- every UI change needs a rebuild/reinstall or a live-update service.

**Effort:** +3–5 days, so about 20–25 days. Strictly worse than 1a for a single-user app that ships daily.

### Option 2: Full SwiftUI rewrite with supabase-swift (2.55.4, 2026-10-13)
- Data layer: supabase-swift auth (password, reset), paged snapshot fetch, a persisted offline queue with ordering and idempotency like `entryScope`, optimistic overlay. 4–5 days.
- Port `lib/domain`: about 1,300 lines of tested TS (dates, schedule, today, progress, stats, strength, nudges). 4–6 days with shared JSON fixtures. After that there are two implementations: web and edge function in TS, app in Swift.
- UI: Today (swipe rows, entry sheet, timer, nudges, note/mood, celebration, week strip), DayReview, WeekGrid, Habits/Detail/Editor (calendar, heatmap, strength ring, plan versions, archive/pauses), Stats, nine Settings sections, Onboarding, Login. 18–25 days.
- Plus the same backend and native-feature work as everyone else (about 12–15 days).

**Effort:** about 40–50 days. **Maintenance:** two full UIs plus two copies of the domain logic for as long as the PWA lives, and the PWA must keep working. Rejected.

### Option 3: Hybrid (SwiftUI for core, WebView for the rest)
- Native Today/quick-check/review; stats, editor and settings stay in the WebView.
- Two UIs only for the core loop. If the native core shows server-computed state, there is still only one copy of the domain logic.
- WebView needs: an embed mode (hide `AppShell` bottom nav, a `/habits/new` route for the "+" that is now a modal in `AppShell.tsx`), a bridge to invalidate the TanStack cache after native writes, and session handling (below).

**Effort:** 22–28 days end-state. **Recommended, but reached in phases**: Phase 1 has no native screens, and Phase 2 adds them only if needed.

## 2. How native code authenticates

| Approach | Pros | Cons |
|---|---|---|
| **A. Share the Supabase session via a Keychain access group.** supabase-swift `KeychainLocalStorage(accessGroup:)` is documented for sharing "an app and its widget… extension"; items use `kSecAttrAccessibleAfterFirstUnlock`. | RLS and existing RPCs (`set_entry`, `add_entry`, `clear_entry`) as-is. | Access tokens expire after about 1 h, so the widget or extension must refresh. Rotation is single-use: a token can be reused only within 10 s or if it is the active token's parent. Otherwise "the whole session is regarded as terminated" (Supabase sessions docs). App, widget and background launches refreshing independently is a real race. Needs native login UI. supabase-swift is too heavy for the 6 MB DeviceActivity extension. |
| **B. Per-device bearer token (extend `ht_` tokens). Recommended.** | No expiry or rotation, so no races. Survives the 9-day silence. Tiny client (URLSession). Already proven by `log_habit` / `ingest_metrics`. Revocable per device. Works in every extension. | Long-lived bearer secret. Mitigations: stored hashed in the DB, kept only in the shared Keychain, narrow set of token functions, per-device revoke, `last_used_at` shown in Settings. Needs new token functions for exact set/clear and reads. |

**Decision: B for all native code** (app process, widget extension, notification-action handler, HealthKit wakes, DeviceActivity). Per Apple's widget docs, widget intents run "in the same process as the widget extension" by default, so the extension needs its own credential.

The WebView keeps its own Supabase cookie session from one password login. That is a separate token family, so there is no race with anything native. `proxy.ts` refreshes it with HTTP `Set-Cookie`, which is not subject to the JS-cookie caps.

Use supabase-swift only if you ever go fully native.

**Token provisioning (no native login screen):**
1. After login in the WebView, web code detects the shell by a UA marker (`applicationNameForUserAgent = "NawykiiOS/1"`).
2. It calls the new function `new_device_token('iPhone – aplikacja')` and posts the token to `window.webkit.messageHandlers.nawyki`.
3. Native checks `frameInfo.isMainFrame` and that the origin host is `nawyki.gmarczak.xyz`, then saves the token in the shared Keychain group.
4. Web sign-out posts `signedOut`; native calls `revoke_device_token`, wipes the Keychain and the App Group cache, and reloads widgets.

## 3. Recommended target architecture

```
iPhone
 ├─ Nawyki.app (SwiftUI, iOS 26+ target; current iOS/Xcode = 27)
 │   ├─ WebContainer: WKWebView → https://nawyki.gmarczak.xyz (Phase 1: all screens)
 │   │     bridge: deviceToken, signedOut, dataChanged, requestPush, requestHealth, openExternal
 │   │     native→web: __nawyki.invalidate(), __nawyki.navigate(url)
 │   ├─ AppDelegate: APNs registration, UNNotificationCategories + action handler,
 │   │     HKObserverQuery + enableBackgroundDelivery, BGAppRefreshTask backstop
 │   └─ (Phase 2) Native Today / Yesterday review rendering day-view JSON
 ├─ NawykiWidgets.appex: Home (small/medium) + Lock Screen (accessoryRectangular/Circular)
 │     Toggle(intent:) / Button(intent:) → SetEntryIntent; ControlWidget for Control Center/Action button
 ├─ (later) DeviceActivityMonitor.appex: threshold → App Group + small token POST
 └─ NawykiKit (SPM): APIClient(token), Codable DayView, AppGroupStore (cache + pending queue,
       FileProtection .completeUntilFirstUserAuthentication), AppIntents + AppEntity(Habit), AppShortcutsProvider
Backend
 ├─ Supabase: device_tokens table, token_* functions, ingest_metrics (exists), send-reminders (+APNs)
 └─ Vercel: /api/native/day (token auth, lib/domain, preferredRegion 'fra1')
```

### Backend changes (Phase 0)
- **`device_tokens`**: `id`, `user_id`, `token_hash` (unique), `label`, `apns_token`, `apns_env` (`sandbox` | `production`), `created_at`, `last_used_at`, `revoked_at`. `token_owner()` accepts `api_tokens` OR non-revoked `device_tokens`, so the Shortcut key keeps working.
- **Refactor** the bodies of `set_entry`/`add_entry`/`clear_entry` into internal functions that take a user id (revoked from anon and authenticated). Then add thin `token_set_entry`, `token_add_entry` (keeps `p_request` idempotency) and `token_clear_entry`. This avoids a second copy of the write logic. Add `token_register_apns(p_token, p_apns, p_env)` and `token_day_data(p_token, p_since)` returning raw rows.
- **`app/api/native/day/route.ts`**: Bearer device token → `token_day_data` → `buildDay`/`badgeCount` from `lib/domain/today.ts` plus `yesterdayGap` from `nudges.ts`. Returns `{ settings, days: [yesterday, today, tomorrow] with validFrom/validTo, items(state, streak, week progress, missedLast), badge }`.
  - Tomorrow is included so the widget timeline can flip at the user's day start (`day_start_hour`) without a network call.
  - Add `/api/native` to `PUBLIC_PATHS` in `proxy.ts`.
  - Set `export const preferredRegion = 'fra1'`, since the DB is in eu-central-1.
- **send-reminders**: add an APNs branch for `device_tokens.apns_token`. Use a token-based JWT (ES256 .p8 through WebCrypto) and HTTP/2 to `api.push.apple.com`, or the sandbox host for Xcode-installed debug builds (store `apns_env`).
  - Payload: `aps.category`, `aps.badge` (already computed in `Message.badge`), `thread-id`, plus `url`, `date`, `habitIds` (extend `Message`).
  - Treat 410/BadDeviceToken like the current 404/410 cleanup.
  - Dedupe: when an iPhone has an active APNs device, skip Web Push subscriptions whose `user_agent` is an iPhone, or ask once in the app to turn the PWA's push off.

### Data flows
- **Widget tap:**
  1. `perform()` runs in the widget extension and appends the change to the App Group pending queue.
  2. It applies an optimistic overlay and awaits `token_set_entry` with about a 4 s timeout.
  3. It returns, and the system always reloads the timeline.
  4. `getTimeline` serves the cached day view plus the overlay, refreshes `/api/native/day` when online, and adds an entry at the next day start.
  5. Lock Screen taps run only after unlock ("buttons and toggles are inactive… unless a person authenticates and unlocks", Apple WidgetKit docs).
- **Notification "Zrobione":**
  - Category `HABIT_ONE` gets actions without `.foreground`: "Zrobione" and "Nie dziś" (value 0, matching the "nie dziś" semantics).
  - Apple: "the system launches your app in the background" and calls `didReceive`. Write with the token, queue if offline, reload widgets, call the completion handler.
  - The device may be locked, so queue files need `.completeUntilFirstUserAuthentication`.
  - Multi-habit reminders (`summary`, `yesterday`): use a foreground "Przegląd" action that opens `/review?date=…`, not a blind "mark all".
- **Notification tap / deep link:** read `userInfo.url`. Phase 1: `__nawyki.navigate(url)`, or `webView.load(base + url)` on a cold start, buffering the URL until the WebView is ready. Phase 2: route Today/review natively. No Universal Links needed. If you add an AASA file later (password AutoFill `webcredentials`), exempt `/.well-known/` in `proxy.ts`, or the matcher will redirect it to `/login`.
- **HealthKit:**
  - Observers are set up in `didFinishLaunching` with `enableBackgroundDelivery`, which needs the `com.apple.developer.healthkit.background-delivery` entitlement. Steps arrive "hourly maximum" on iOS.
  - Compute per-local-day totals (honour `day_start_hour` from the cached settings) for today and yesterday, call `ingest_metrics` with an explicit `p_date` (idempotent thanks to `greatest()`), and always call the observer completion (three misses stop delivery).
  - The store can't be read while locked, so expect catch-up after unlock. Add a BGAppRefresh and on-foreground sync as a backstop.
  - Basen needs a swim-only metric, e.g. `swim_workouts`. The current `habits.source` check constraint only has a generic `workouts`.
- **Web ↔ native consistency:** after any native write or HealthKit ingest, call `evaluateJavaScript("__nawyki?.invalidate()")`, which maps to `invalidateQueries(snapshotKey)` exposed from `providers.tsx`. Web habit edits post `dataChanged`, so native reloads widget timelines.
- **App Intents:** `SetEntryIntent(habit: HabitEntity)` plus an `AppShortcutsProvider` gives Siri phrases with zero user setup (the owner refuses Shortcuts). The same intent backs a `ControlWidget` for Control Center, the Lock Screen and the Action button.

### Web changes (all guarded by `isNativeShell`, so the PWA is untouched)
- New `lib/native.ts`: UA detection plus `postNative()`.
- `features/reminders/push.ts`, `ReminderSettings`, `ReminderPrompt`: native permission and registration via the bridge; never subscribe Web Push in the shell; no "add to home screen" message.
- `features/auth/LoginForm.tsx`: password only in the shell.
- Settings Siri/Health sections: replace the Shortcut and API key instructions with "Połącz z Apple Zdrowie" via the bridge.
- `providers.tsx`: expose `window.__nawyki = { invalidate, navigate }`. Provision the device token after login and revoke it on sign-out.
- `proxy.ts`: add the public path. `useAppBadge` is already guarded (`setAppBadge` is absent in WKWebView); the native badge comes from APNs `aps.badge`.

### WKWebView host specifics
- `WKAppBoundDomains = [nawyki.gmarczak.xyz]` plus `limitsNavigationsToAppBoundDomains = true`, to keep the SW offline shell. Open every other domain via `decidePolicyFor` → SFSafariViewController.
- Keep a native offline/error view in case SW registration fails on iOS 27. Verify on a device in a half-day spike.
- `allowsBackForwardNavigationGestures = false` (row swipes; the web has explicit back links in `sections.tsx` and `HabitDetail.tsx`).
- `scrollView.contentInsetAdjustmentBehavior = .never`, so CSS safe-area insets apply exactly as in the PWA.
- Non-opaque web view with the background set to #f2f2f7 / black.
- UIViewRepresentable around WKWebView rather than the iOS 26 SwiftUI `WebView`/`WebPage`, because message handlers and App-Bound config are proven there.

## 4. Migration path

| Phase | Content | Days |
|---|---|---|
| 0 Backend | `device_tokens`, token functions (plus tests in `supabase/tests/assertions.sql`), `/api/native/day`, APNs sender + dedupe | 3.5–4.5 |
| 1 Shell + native surfaces | Xcode project, App Group, Keychain group, entitlements, NawykiKit (1.5); WebView host + bridge + App-Bound/SW spike (2–2.5); web shell branches (1.5); widget Home + Lock Screen (3–4); notification categories and actions (1); HealthKit background (2.5–3.5); App Intents / Control / Siri phrases (0.5–1) | 12–15 |
| 2 (optional, after 2–4 weeks of use) | Native Today + quick check + yesterday review rendering the day-view JSON, offline queue shared with the widget, web embed mode (hide AppShell nav, `/habits/new`) | 6–8 |
| 3 (optional) | DeviceActivity for Duolingo/Fitatu: 6 MB extension, opaque app tokens, threshold event → App Group + token POST. The Family Controls distribution permission needs Apple approval (reported waits of 3–5 weeks). Development-signed builds work while the request is pending. | 2–3 |

The PWA keeps working throughout. All database changes are additive, Web Push stays for the PWA, and the web branches only activate in the shell. Because the UI lives in the WebView, UI fixes still ship through Vercel without reinstalling. Native code changes rarely, which suits Xcode-direct installs (valid up to 1 year) or TestFlight (90-day builds).

## 5. Effort summary (one experienced developer)
- Capacitor `server.url`: about 16–20 days, unsupported path plus framework churn.
- Capacitor bundled: about 20–25 days, and UI changes need a rebuild.
- Full SwiftUI: about 40–50 days, two UIs and two copies of the logic.
- **Recommended hybrid in phases: about 16–20 days to all core goals**, about 22–28 days if Phase 2 is built.

## Risks

- api_tokens has user_id as its primary key, so each user has exactly one key. Regenerating it in Settings (or for the native app) silently cuts off the other client. Migrate to a per-device token table before shipping native.
- Per-device tokens are long-lived bearer secrets with no expiry. Keep the hash-only storage, the narrow token functions, per-device revoke and last_used_at in Settings, and store the token only in the shared Keychain group (AfterFirstUnlock).
- Sharing one Supabase session across app and extensions risks refresh-token reuse detection revoking the whole session (10 s reuse window plus parent exception only). That is why the plan avoids it. If someone later adds supabase-swift to an extension, this comes back.
- Service workers in WKWebView need WKAppBoundDomains plus limitsNavigationsToAppBoundDomains. That blocks other-domain navigation, and forum reports describe side effects on other web views. SW registration on iOS 27 must be checked on a device; fall back to a native offline screen.
- Web Push does not work in WKWebView. If the PWA stays installed with push enabled next to the native app on the same iPhone, every reminder arrives twice unless send-reminders dedupes.
- APNs environment mismatch: Xcode debug installs use the sandbox APNs host, TestFlight/Ad Hoc use production. Store apns_env per device or pushes fail silently. Deno HTTP/2 to APNs from Supabase Edge needs a short spike.
- Lock Screen widget buttons only run after Face ID unlock (Apple WidgetKit docs), so 'check from the lock screen' still involves an unlock.
- HealthKit can't be read while the phone is locked, background delivery is budgeted, and steps arrive at most hourly. Auto-check will lag (often until the next unlock), which needs a BGAppRefresh/foreground backstop.
- Notification actions can run while the device is locked. App Group queue files need FileProtection .completeUntilFirstUserAuthentication or the 'Zrobione' write is lost.
- The Today/review screens are the most actively changed area (most recent PRs). A native Phase 2 copy will drift unless it only displays server-computed day-view JSON.
- WKWebView cookie and IndexedDB persistence: storage-cap exemption for non-browser WKWebView apps is not officially documented. The PWA already depends on server-set cookies from proxy.ts. Test kill and relaunch after several days of non-use on a device.
- The Family Controls distribution permission (for Screen Time detection) requires Apple approval and may be needed even for TestFlight/Ad Hoc. Development builds installed from Xcode work without it.
- The Vercel function region defaults to US. Without preferredRegion 'fra1' every widget refresh to /api/native/day pays transatlantic round-trips to the Frankfurt Supabase.
- If Capacitor is chosen despite this advice: server.url is documented as not intended for production, Capacitor 9 is already in alpha, and its notification handling sits in the same delegate path that the custom 'Zrobione' handling needs.

## Open questions

- Will the owner keep the PWA installed with Web Push on the same iPhone after the native app ships? This decides whether send-reminders dedupes automatically or the app asks once to turn off PWA push.
- Is an offline cold start of the in-app web UI required (App-Bound Domains + service worker, needs a device spike on iOS 27), or is a native 'Brak sieci' screen with retry acceptable, given that widget, notifications and HealthKit work offline through the native queue?
- Distribution choice: Xcode-direct install (provisioning up to 1 year, sandbox APNs, Family Controls works with development signing) or TestFlight (90-day builds, production APNs, may need the Family Controls distribution permission)?
- Should the day-view endpoint live on Vercel (/api/native/day, auto-deploys with git, needs preferredRegion fra1) or as a Supabase Edge Function next to the DB (already bundles lib/domain, manual deploy)? I lean to Vercel for consistency with /api/log and /api/ingest.
- For multi-habit reminders (summary, yesterday at 09:00), should actions only open the review, or should a notification content extension offer per-habit buttons in the expanded notification?
- After Phase 1, does the in-WebView Today feel good enough to skip the native Phase 2? Decide after 2–4 weeks of real use.
- Should the existing Shortcut API key (api_tokens) be kept indefinitely for Siri/NFC/Watch Shortcuts, or retired once App Intents and AppShortcutsProvider cover those cases?

## Sources

- https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities (interactive families incl. accessoryCircular/Rectangular; intents run in widget extension process by default; inactive on a locked device; timeline reload after perform)
- https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types (background launch for actions, aps.category, locked-device file protection)
- https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:) (background-delivery entitlement, stepCount hourly max, completion handler / 3-miss rule)
- https://developer.apple.com/forums/thread/763701 (HealthKit: no writes while locked, budgeted updates)
- https://developer.apple.com/forums/thread/760767 (Apple DTS: Web Push will not work in WKWebView; service workers do)
- https://webkit.org/blog/10882/app-bound-domains/ (App-Bound Domains)
- https://developer.apple.com/forums/thread/781744 (SW registration requires WKAppBoundDomains)
- https://developer.apple.com/forums/thread/770366 (App-Bound side effects on other web views)
- https://github.com/ionic-team/capacitor/blob/main/cli/src/declarations.ts (server.url: 'This is not intended for use in production'; limitsNavigationsToAppBoundDomains notes)
- https://capawesome.io/blog/the-right-way-to-update-your-capacitor-app-remotely (Ionic team: server.url only for live reload)
- https://registry.npmjs.org/@capacitor/ios (dist-tags: latest 8.5.3, next 9.0.0-alpha.8, checked 2026-10-25)
- https://blogs.apievangelist.com/blogs/ionic-2025-12-09-announcing-capacitor-8/ (Capacitor 8, Dec 2025, SPM default)
- https://github.com/supabase/supabase-swift/blob/main/Sources/Auth/Storage/KeychainLocalStorage.swift (accessGroup sharing with widget/extensions; AfterFirstUnlock)
- https://github.com/supabase/supabase-swift/blob/main/CHANGELOG.md (v2.55.4, 2026-10-13)
- https://supabase.com/docs/guides/auth/sessions (refresh token single use, 10 s reuse interval, session revoked on reuse)
- https://imagazine.pl/2026/09/11/premiera-ios-27-potwierdzona-na-14-wrzesnia-apple-otwiera-zgloszenia-aplikacji/ (iOS 27 release 14 Sep 2026)
- https://www.mactech.com/2026/09/10/app-store-submissions-now-open-for-the-latest-os-releases/ (Xcode 27 / iOS 27 SDK submissions)
- https://developer.apple.com/forums/thread/839939 (iOS 27 SDK requirement from April 2027)
- https://webkit.org/blog/16993/ (WWDC25: SwiftUI WebView/WebPage, iOS 26)
- https://developer.apple.com/videos/play/wwdc2026/277 (WWDC26 WidgetKit session)
- https://bitrise.io/blog/post/wwdc26-under-the-radar (WWDC26: SiriKit deprecated, App Intents only)
- https://developer.apple.com/documentation/familycontrols (entitlement request before distribution)
- https://developer.apple.com/forums/thread/806301 (Family Controls distribution approval waits; dev builds work)
- https://habitdoom.com/blog/shipping-familycontrols-ios (DeviceActivityMonitor 6 MB limit, App Group-only sharing)
- https://developer.apple.com/forums/thread/823069 (own-device/Ad Hoc provisioning up to 1 year; TestFlight 90 days)
- https://ionic.io/blog/is-apple-trying-to-kill-pwas (ITP 7-day cap and WKWebView apps)
- /home/user/habit-tracker/node_modules/next/dist/docs/01-app/02-guides/static-exports.md (Next 16 static export: Proxy, Route Handlers, Cookies, dynamic routes, default image loader unsupported)
- /home/user/habit-tracker/proxy.ts, /home/user/habit-tracker/app/providers.tsx, /home/user/habit-tracker/public/sw.js, /home/user/habit-tracker/lib/db/client.ts, /home/user/habit-tracker/features/reminders/push.ts, /home/user/habit-tracker/features/auth/LoginForm.tsx, /home/user/habit-tracker/supabase/migrations/20261023120000_health_ingest.sql, /home/user/habit-tracker/supabase/migrations/20261025090000_audit_fixes.sql, /home/user/habit-tracker/supabase/functions/send-reminders/src.ts, /home/user/habit-tracker/supabase/functions/send-reminders/logic.ts (repo grounding)
