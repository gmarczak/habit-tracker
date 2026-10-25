# Notatki badawcze: Architektura aplikacji (Capacitor / SwiftUI / hybryda)

_Materiał źródłowy do `docs/ios/PLAN.md` (stan na 2026-10-25, po angielsku). Gdy plan i notatki się różnią, obowiązuje plan._

## Summary

- **Server push.** Keep the server (Supabase cron + `logic.ts`) as the only place that decides what a reminder says. Add APNs as a second delivery channel next to Web Push in `send-reminders`. Do not port the reminder logic to local notifications. One `notification_log` claim per reminder per day covers both channels.
- **HTTP/2 to Apple's push service (APNs).** Deno's `fetch` switches to HTTP/2 automatically when the server supports it. No Supabase document confirms that its Edge Runtime does the same, and I found no public report of anyone testing it. A 30-minute test function settles it: if APNs answers a fake device token with a JSON `{"reason":...}`, HTTP/2 works. If it fails, send through a small Vercel Node.js route that uses `node:http2`. Do not route through Firebase (FCM).
- **Login token (JWT).** Sign the ES256 token with WebCrypto, which already returns the signature in the format JWT needs (no DER conversion). Cache it for about 50 minutes, in memory and in a database table. Apple rejects a token older than 60 minutes and returns an error (429 `TooManyProviderTokenUpdates`) if a new token is used more than once per 20 minutes on the same connection. Signing a fresh one on every 5-minute cron run risks that error.
- **Notification buttons.** Two notification types:
  - `HABIT` (a reminder about one habit, including the "today one is enough" comeback push): "Zrobione" / "Nie dziś". Both run in the background, with no unlock needed.
  - `MULTI` (summary, time-of-day and the 09:00 "yesterday" push): "Wszystko zrobione" plus "Uzupełnij", which opens the app. A long-press view (Notification Content Extension) shows a tap-to-check list, one row per habit.
  - The server puts the habit ids and the date into each push. The phone never has to guess which day an answer is for.
  - The extension that edits a push on arrival (Notification Service Extension) is not needed in v1: the server builds the text right when it sends.
- **Login for widgets, notification buttons and Siri.** The app, widget, notification extension and Siri actions all run as separate processes. If several of them refresh the same Supabase session, Supabase's refresh-token reuse detection (default window about 10 s) can revoke the whole login. Use a per-device API key in a shared Keychain, readable after first unlock, and make the server's write functions idempotent. Today `api_tokens` has `user_id` as its primary key, so creating a key for the app would kill the Shortcuts key. It needs to allow several keys per user.
- **Home-screen widget.** Interactive buttons on iOS 17+. The tap action runs in the widget extension and the widget is always redrawn after it. Order of work: save the change to a local outbox (one JSON file per change, in the shared App Group folder), update the stored snapshot at once, try the network with a short timeout, then return.
  - The snapshot covers yesterday, today and tomorrow, so the widget changes over at midnight without a network call.
  - Before noon the widget shows "Wczoraj" first, which matches how the owner actually logs (next morning).
- **Lock screen and Control Center.** Widget buttons do nothing on a locked phone (Apple: they only run after the person unlocks), so Lock Screen widgets are mostly for glancing (progress ring, what's left).
  - The tap-without-unlocking path is a Control (iOS 18+, one per habit). It can go in Control Center, the Lock Screen bottom slots or the Action Button. Controls run while locked by default.
  - iOS 26 added server-triggered refresh for widgets (push type `widgets`) and controls (push type `controls`), for changes made in the PWA.
- **Siri.** App Shortcuts work after install with no setup by the owner. Limits: max 10 shortcuts, every phrase must contain the app name, and at most one parameter per phrase (here, the habit). Siri has no Polish voice in iOS 27; the new Siri AI only has text-only Polish and is not available in the EU.
  - So "Odhacz Spacer" said aloud cannot work in Polish. Phrases have to be in whatever language the owner's Siri uses, probably English: "Log Spacer in Nawyki".
  - Add synonyms for habit names (Spacer → walk, Basen → pool), which Apple says help App Shortcuts match spoken names.
  - Typing "Spacer" in Spotlight shows the same action in Polish, which is the realistic "Odhacz Spacer".
- **Live Activities.** Skip in v1. They last at most 8 hours (12 on the Lock Screen), so they cannot be a daily status bar. A later meditation/reading timer could use one.
- **Effort.** About 13–17 days for this area: server push ≈3, phone notifications ≈3, widgets and controls ≈4–5, Siri ≈1–1.5, snapshot route and write functions ≈1, testing on the device ≈2.

## Recommendation

Do this in three phases. Each one is usable on its own, and the PWA keeps working throughout.

**Phase 1 (core, about 8 days)**
1. Run the HTTP/2 test from the Supabase edge function before any other APNs work. If it fails, decide on the Vercel `node:http2` route then.
2. Database changes:
   - a new `apns_devices` table (kind alert/widgets/controls, environment sandbox/production);
   - `api_tokens` changed to allow several keys per user (one per device);
   - idempotent write functions for the native app: done = set value to max(current value, target); "nie dziś" = 0 only if nothing positive is recorded yet; one function per action.
3. Extend `Message` in `logic.ts` with `category`, `habitIds` and `forDate`, plus Vitest tests. Add an `apns.ts` channel to `src.ts`. Pause iPhone Web Push subscriptions while an APNs device is active, and turn them back on automatically when APNs reports the device gone (410).
4. On the phone:
   - push registration and the two notification types, with buttons that run in the background;
   - a shared Swift package with the snapshot store, outbox, API client and Keychain credentials;
   - interactive home-screen widgets (medium and large) with the morning "Wczoraj" mode;
   - App Shortcuts in the owner's Siri language, plus Polish ones for Spotlight.
   - Whether the snapshot comes from a Vercel route reusing `lib/domain` or from Swift code is the architecture track's decision. I lean towards the server route.

**Phase 2 (about 4–5 days):** one Control per habit, for Control Center, the Lock Screen and the Action Button. Lock Screen widgets (ring, "zostały"). The long-press checklist for the "yesterday" push. Server-triggered refresh for widgets and controls, sent from the existing 5-minute cron whenever `habit_entries.updated_at` has changed since the last refresh push.

**Phase 3 (optional):** a push-editing extension (Notification Service Extension), a Live Activity timer, and Siri snippets with buttons (iOS 26+).

**Never:** a second copy of the reminder logic in Swift as local notifications, a shared Supabase login across processes, or SQLite in the App Group folder.

## Effort

13-17 person-days for this area: server APNs channel ~3 (test + schema + JWT/send + logic.ts metadata + Web Push dedupe), phone notifications ~3 (registration, notification types, background actions, outbox, long-press checklist), widgets and controls ~4-5, Siri/App Shortcuts ~1-1.5, snapshot route + device write functions ~1, testing on the device ~2. Add 0.5-1 day if the HTTP/2 test fails and the Vercel node:http2 route is needed.

## Details

## 0. What the repo already gives us

- **`/home/user/habit-tracker/supabase/functions/send-reminders/logic.ts`**
  - `messagesFor()` is pure and tested. It returns `{reminderId, localDate, title, body, url, tag, badge}`.
  - It already excludes Apple Health habits (`habit.source`), quit habits and answered "nie dziś" (`isAnsweredNo`).
  - It has quiet/comeback mode ("Dziś wystarczy jedno: X"), "Nie odpuść dwa razy", and yesterday/weekly reminders.
  - The comeback push for one easy habit is the best candidate for a one-tap "Zrobione". It goes straight at the 9-day silence pattern.
- **`/home/user/habit-tracker/supabase/functions/send-reminders/src.ts`**
  - It claims `notification_log (reminder_id, local_date)` first, then sends to every `push_subscriptions` row.
  - If nothing was delivered, it releases the claim so the next cron run retries.
  - That idempotency carries over to APNs unchanged: claim once, send on all channels, count `delivered` across channels.
  - Keys come from Vault via the `push_config(p_secret)` function (migration `20261011213358_reminders_cron.sql`). Add an `apns_config(p_secret)` the same way.
- **`/home/user/habit-tracker/app/api/log/route.ts` + function `log_habit`** (migration `20261025090000_audit_fixes.sql`)
  - Logs a habit by name and **adds** to duration/count habits (+target).
  - Fine for Siri via Shortcuts, but **not** idempotent. A retried notification button or outbox replay would double Ruch or Czytanie, so native actions need write functions with absolute values.
  - `add_entry(p_request uuid)` already shows the request-id pattern.
- **`api_tokens.user_id` is the PRIMARY KEY** (migration `20261023120000_health_ingest.sql`). There is one key per user, and `new_api_token()` replaces it. A native device key would revoke the owner's existing Shortcut key, so this needs to change: id PK, `user_id`, `label`, `kind ('shortcut'|'device')`, `token_hash unique`, `last_used_at`.
- **`/home/user/habit-tracker/lib/domain/today.ts`**: `buildDay()` gives todo / thisWeek / done / quit / progress / missedLast, and `badgeCount()` = `todo.length`. This is exactly what a widget needs. Build the widget snapshot from it on the server (a Vercel route can import `lib/domain`) rather than porting it to Swift.
- **`/home/user/habit-tracker/public/sw.js`**: Web Push already uses `tag` (replacement) and `badge`. APNs equivalents are `apns-collapse-id` and `aps.badge`. Web Push on iOS has no action buttons, which is one reason to go native.

## 1. Native push from the existing edge function

### 1a. Keys, login token (JWT), environments
- Create an APNs **auth key (.p8)**. Apple's keys are now **environment-scoped**: a team key works for either Sandbox or Production, with at most 2 keys per environment.
  - Builds installed from Xcode (development signing) produce **sandbox** device tokens.
  - TestFlight / Ad Hoc builds produce **production** tokens.
  - Store `environment` with every token. A mismatch gives `400 BadDeviceToken` ("…token matches the environment").
- Vault secrets: `apns_key_p8`, `apns_key_id`, `apns_team_id`, `apns_bundle_id`. Return them via `apns_config(p_secret)`, with execute rights for service_role only, exactly like `push_config`.
- Token: header `{alg: "ES256", kid}`, claims `{iss: teamId, iat}`. Apple: iat must be under 1 hour old (else `403 ExpiredProviderToken`), refresh "no more than once every 20 minutes and no less than once every 60 minutes", and `429 TooManyProviderTokenUpdates` if refreshed too often.
- **Gotcha:** the cron starts a fresh function instance every 5 minutes. Signing on every run means 12 tokens per hour. Cache the token in memory **and** in a service-role-only table `apns_provider_tokens(environment pk, jwt, issued_at)`, reuse it for 50 minutes, and re-sign once on `ExpiredProviderToken`/`InvalidProviderToken`.

```ts
// supabase/functions/send-reminders/apns.ts (sketch)
const der = Uint8Array.from(atob(p8.replace(/-----[^-]+-----|\s+/g, "")), c => c.charCodeAt(0));
const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
const input = `${b64url(json({ alg: "ES256", kid }))}.${b64url(json({ iss: teamId, iat }))}`;
const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc(input)));
// WebCrypto ECDSA returns raw r||s (64 B) = JWS ES256 format. Node's crypto.sign returns DER unless dsaEncoding:"ieee-p1363".
```

### 1b. HTTP/2
- APNs requires **HTTP/2 + TLS 1.2+** and does not speak HTTP/1.1.
- Deno docs: `fetch()` over https negotiates HTTP/2 via ALPN automatically. Supabase Edge Runtime is a Deno-based runtime, but **I found no Supabase statement or public report confirming h2 to api.push.apple.com.** A GitHub issue opened 2026-10-20 asks exactly this and is unanswered.
  - Caveat: Deno's `node:http2` had bugs fixed as late as 2.7.13, so only use that as a second option.
- **30-minute test:** deploy `apns-probe`, which POSTs to `https://api.sandbox.push.apple.com/3/device/00` with any headers.
  - Any JSON body `{"reason":"BadDeviceToken"|"MissingProviderToken"|…}` proves an HTTP/2 conversation, because APNs only answers that way over h2.
  - A connection reset or protocol error means no h2.
  - I could not run it from here: the sandbox proxy blocks APNs.
- **Fallback if it fails:** the Vercel route `app/api/internal/apns/route.ts` (`runtime = "nodejs"`) uses `node:http2` (mature) and is protected by the cron secret. The edge function keeps all the logic and POSTs the finished messages and device list to it.
  - Do not use FCM: it would put the Firebase SDK in the app for no benefit.
  - Cloudflare Workers-style runtimes are a known dead end for APNs.

### 1c. Device token storage (migration)
```sql
create table public.apns_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  token text not null unique,                 -- hex; widgets/controls tokens are separate rows
  kind text not null check (kind in ('alert','widgets','controls','liveactivity')),
  environment text not null check (environment in ('sandbox','production')),
  bundle_id text not null, app_version text, device_name text,
  created_at timestamptz not null default now(), last_seen_at timestamptz, last_used_at timestamptz, disabled_at timestamptz);
-- RLS own_rows; RPC register_apns_device(...) = upsert on token (re-assigns user_id), sets last_seen_at
alter table public.push_subscriptions add column paused_at timestamptz;  -- iPhone Web Push paused while native is active
```
- **Duplicate-notification gotcha:** with the PWA still subscribed on the same iPhone, every reminder would arrive twice.
  - `register_apns_device(kind='alert')` sets `paused_at` on that user's Web Push subscriptions whose `user_agent` matches iPhone/iPad. Desktop subscriptions keep working.
  - When APNs answers 410 `Unregistered`/`ExpiredToken` or 400 `BadDeviceToken`/`DeviceTokenNotForTopic`, set `disabled_at` and **clear `paused_at`**. Deleting the native app then automatically falls back to the PWA.

### 1d. Changes to `logic.ts` (pure, tested in Vitest)
- Extend `Message` with:
  - `kind`;
  - `forDate` (yesterday push = `gap.date`, otherwise today);
  - `habitIds` (exactly the habits a "done" answer should record);
  - `category`.
- Rules for `category`:
  - `habit` → `HABIT` with `[habitId]`.
  - Comeback → `HABIT` with the easy habit's id.
  - Summary → `MULTI`; `habitIds` = **daily only (`forToday`)**, matching the PWA rule "Wszystko zrobione tylko codzienne" (commit 595f4a5).
  - Time-of-day reminders → `MULTI`, or `HABIT` if there is a single habit.
  - Yesterday → `MULTI` with `gap.missing`.
  - Weekly → `WEEKLY` (no actions).
- Web Push ignores the new fields.

### 1e. Changes to `src.ts`
- `if (subs.length === 0) continue` becomes "no active Web Push subscriptions and no APNs devices".
- Build a list of channels `[webPush(subs.filter(!paused)), apns(devices)]` and keep `delivered` / release-claim exactly as now.
- Request:
  - headers: `apns-push-type: alert`, `apns-topic: <bundleId>`, `apns-priority: 10` (5 for summary/weekly), `apns-expiration: now+3600` (= Web Push TTL), `apns-collapse-id: ${tag}:${localDate}` (≤64 bytes; replaces like Web Push `tag`);
  - body ≤4 KB:
```json
{"aps":{"alert":{"title":"Wczoraj zostały 2","body":"Spacer, Czytanie — uzupełnij, jeśli zrobiłeś."},
 "badge":3,"sound":"default","category":"MULTI","thread-id":"yesterday","interruption-level":"time-sensitive"},
 "kind":"yesterday","date":"2026-10-24","habits":["<uuid>","<uuid>"],"url":"/review?date=2026-10-24"}
```
- Use `time-sensitive` (needs the Time Sensitive Notifications capability) only for the 09:00 yesterday push and the comeback push. These are the pushes that must get past Focus or Scheduled Summary. Everything else uses `active`.
- Errors:
  - 403 Expired/InvalidProviderToken → re-sign once and retry.
  - 410 / BadDeviceToken / DeviceTokenNotForTopic → disable the device and un-pause Web Push.
  - 429 TooManyRequests and 5xx → count as failed; the claim release means the next run in the 60-minute window retries.
- **Second job in the same cron:** if `max(habit_entries.updated_at)` for the user is newer than `last_widget_push_at`, send `{"aps":{"content-changed":true}}` to `kind='widgets'` tokens (`apns-push-type: widgets`, topic `<bundle>.push-type.widgets`) and `kind='controls'` tokens (`controls`, `<bundle>.push-type.controls`). This is a free 5-minute debounce for PWA edits. Apple delivers these opportunistically and within a budget.
- **Later logic change:** `messagesFor` skips Apple Health habits because "Skrót odhacza wieczorem". Once native HealthKit background delivery is live, consider including them with progress ("Ruch 18/30 min"), but only when `health_daily` was updated within the last few hours. Otherwise it would nag about things already done.

### 1f. Notification types and buttons on the phone
- Register at every launch with `setNotificationCategories`:
  - `HABIT`: `DONE` "Zrobione" (icon `checkmark`, options `[]`, so it runs in the background) and `NO` "Nie dziś" (options `[]`).
  - `MULTI`: `ALL_DONE` "Wszystko zrobione" (`[]`) and `OPEN` "Uzupełnij" (`.foreground`, deep link to `url`).
  - `WEEKLY`: no actions.
  - Action identifiers must be unique across all types.
- **Flow (Apple: tapping a button "launches your app in the background" and calls `userNotificationCenter(_:didReceive:withCompletionHandler:)`):**
  1. Read `kind / date / habits` from userInfo.
  2. Inside `UIApplication.beginBackgroundTask`:
     - (a) write one outbox file per habit (`{op: "complete"|"no", habitId, date, requestId}`);
     - (b) apply the change to the App Group snapshot, then `WidgetCenter.shared.reloadAllTimelines()` and `ControlCenter.shared.reloadAllControls()`;
     - (c) flush the outbox to the device write functions with an ~8 s timeout;
     - (d) `UNUserNotificationCenter.setBadgeCount(newTodoCount)` and remove delivered notifications whose habits are now all answered;
     - (e) call `completionHandler()`.
  3. Whatever fails stays in the outbox. It is flushed on next launch, by `BGAppRefreshTask`, on any widget tap, or on a HealthKit background wake.
- **Locked-phone gotcha (Apple quote):** "Users can respond to actions while the device is locked, which would make files encrypted with `complete` unavailable." So:
  - Keychain item for the device key: `kSecAttrAccessibleAfterFirstUnlock`.
  - App Group files: default `completeUntilFirstUserAuthentication`.
  - No `.authenticationRequired` on "Zrobione". It is a deliberate choice that a habit can be checked off without Face ID.
- **Long-press checklist (Notification Content Extension):** for `MULTI`, `UNNotificationExtensionCategory = MULTI` and `UNNotificationExtensionUserInteractionEnabled = YES`. Show one row per habit, each with ✓ / "nie". The extension handles taps itself through the same outbox and API. Gotcha: SwiftUI in a content extension needs a `UIHostingController` with an explicit `preferredContentSize`, because blank or black views are a known forum issue.
- **Push-editing extension (NSE) not needed in v1:**
  - Text is computed fresh at send time.
  - Hiding a notification completely requires the `com.apple.developer.usernotifications.filtering` entitlement, which Apple must approve.
  - Reloading widgets from an NSE is reported unreliable outside Xcode.
  - Only revisit it to reconcile the text with offline outbox entries.
- **Local notifications:** do **not** use them as a reminder fallback; that would need a second copy of the logic and the content would go stale. Fallback is Web Push, re-enabled automatically (§1c). Local notifications are only for a future timer, and optionally for a `passive` confirmation like "Spacer ✓ 8 234 kroków" after a HealthKit auto-check, so the invisible automation becomes visible. Make that optional and off by default.

## 2. Interactive widgets (WidgetKit + App Intents)

### Components
- **`NawykiKit` (Swift package, linked into the app, the widget extension and the notification extension):**
  - `SnapshotStore`: one JSON file in the App Group, written atomically.
  - `Outbox`: a folder with one `<uuid>.json` per change, so processes never write the same file.
  - `APIClient`: plain URLSession to Supabase RPCs with the anon key plus the device key. Don't put supabase-swift in the widget extension; it has a tight memory limit (~30 MB).
  - `DeviceCredentials`: Keychain access group.
  - `HabitEntity` / `HabitQuery`.
  - Intents: `CompleteHabitIntent(habitId, date)`, `AnswerNoIntent(habitId, date)`, `HabitToggleIntent: SetValueIntent` for controls.
  - Polish plural strings in a String Catalog.
- **Widget extension:**
  - `TodayWidget` in systemSmall (ring + next habit button), systemMedium (4 rows with buttons), systemLarge (all 7 + weekly Basen 1/2). `systemExtraLargePortrait` is new in iOS 27 and optional.
  - `LockWidgets`: accessoryCircular (Gauge done/total), accessoryRectangular ("3/6 · Spacer, Czytanie"), accessoryInline.
  - `HabitControl` (§2c).
  - `WidgetPushHandler` and `ControlPushHandler`, which send tokens to `register_apns_device(kind='widgets'|'controls')`.

### Snapshot (written by the app, the widget intent, the notification action or a HealthKit wake; read by the timeline provider)
```json
{"v":1,"generatedAt":"…","timeZone":"Europe/Warsaw","dayStartHour":0,
 "days":{"2026-10-24":{…},"2026-10-25":{"progress":{"done":2,"total":5},
   "items":[{"habitId":"…","name":"Spacer","icon":"…","kind":"check","target":1,"value":null,
             "state":"todo","source":"health","week":null,"missedLast":true,"goal":"build"}]},
   "2026-10-26":{…precomputed, all todo…}}}
```
- Build it with `buildDay()` for yesterday, today and tomorrow, using the **profile time zone / dayStartHour, not the device time zone** (same as `lib/domain/dates`).
- The server route is `GET /api/native/snapshot` with the device key. Apply optimistic changes locally (flip state, recompute progress).

### Timeline and data flow
- **Entries:**
  - now;
  - **12:00** (end of the morning "Wczoraj" section, shown only if yesterday has unanswered daily habits; its buttons carry `date = yesterday`);
  - the **next day boundary** (local midnight + dayStartHour), switching to the precomputed tomorrow.
  - Policy `.after(nextBoundary)`.
- **Tap:** the system runs `perform()` **in the widget extension process**. Order:
  1. Flush pending outbox entries.
  2. Write the new outbox entry and patch the snapshot.
  3. `try await` the network (≤5 s).
  4. On success, replace the snapshot with the server's response.
  5. Return.
  - Apple: "Interactions with a toggle or button always guarantee a timeline reload."
  - Use `Toggle(isOn:intent:)` for check-type habits; it updates its look optimistically. Use `Button(intent:)` + `.invalidatableContent()` for the count habit (Czytanie +5).
  - **Always put the date in the intent** (it is fixed when the widget is drawn). Never use "today", or a tap after midnight on a stale widget would record the wrong day. The server function rejects future dates and dates more than 7 days back.
  - If the server rejects an entry (e.g. `date_before_start`), undo it and mark the snapshot `syncError`.
- **Freshness sources:**
  - app foreground or background (reload once when the app goes to background, because reloads while it's in the foreground are throttled);
  - HealthKit background delivery wakes;
  - widget tap;
  - widget/control push from the server for PWA edits (iOS 26+);
  - timeline entries at the day boundary.
  - Reload budget: Apple does not publish a number; it depends on how often the owner looks at the widget. Use WidgetKit developer mode while testing.
- **Offline:** the outbox survives everything; the widget shows the optimistic state plus a small "niezsynchronizowane" dot.
  - **Gotcha:** don't keep a SQLite file open in the App Group folder. Holding its lock while the app is suspended gets it killed (0xdead10cc). JSON files are enough at this scale.
- **Apple Health habits** (Spacer, Ruch, Medytacja, Basen): show live progress ("Ruch 18/30") with a small heart. Keep a manual button for overrides, using the "max with target" rule so it never lowers a HealthKit value.

### 2b. Lock Screen
- Apple: "On a locked device, buttons and toggles are inactive and the system doesn't perform actions unless a person authenticates and unlocks". Lock Screen widgets are for glancing; in practice a tap works right after Face ID.

### 2c. Controls (iOS 18+): the real tap-without-unlocking path
- `HabitControl`: `AppIntentControlConfiguration`, with the habit chosen as a `HabitEntity` parameter. It shows `ControlWidgetToggle(isOn: doneToday, action: HabitToggleIntent)`, and `currentValue()` reads the snapshot.
- Can be placed in Control Center, the Lock Screen bottom slots (instead of flashlight/camera) or the **Action Button**, with zero Shortcuts.
- Default `authenticationPolicy = .alwaysAllowed`, so it runs while locked. Examples: "Sen przed 23:00" at 22:50 from Control Center; Czytanie on the Action Button.
- Reload with `ControlCenter.shared.reloadControls(ofKind:)` after any change, or remotely with push type `controls`.

### 2d. Live Activities
- Not in v1. Limit: 8 hours of active updates, 12 hours on the Lock Screen at most, so they cannot be a daily status bar.
- Possible v2: a Medytacja/Czytanie timer. Its intents must conform to `LiveActivityIntent`, which runs in the **app** process. Low value, because Medytacja/Ruch come from HealthKit anyway.

## 3. Siri and App Shortcuts (no setup by the owner)

- **`NawykiShortcuts: AppShortcutsProvider`** must be in the app target.
  - Available right after install. Call `updateAppShortcutParameters()` after every habit-list change so phrases with a habit name work.
  - **Limits:** max 10 App Shortcuts; every phrase must contain `\(.applicationName)` (Xcode error "Invalid Utterance"); one parameter per phrase (build error "A single phrase can only use a single parameter"); parameter types must be AppEntity or AppEnum; phrases are fixed at build time.
- **Language reality:** Polish voice Siri does not exist in iOS 27. The new Siri AI has only text-only Polish and is not available in the EU / for Poland.
  - Ship phrases in **the language the owner's Siri is set to** (ask; likely English) in `AppShortcuts.xcstrings`. Also ship Polish for Spotlight and the Shortcuts app UI.
  - English: "Log \(\.$habit) in \(.applicationName)", "Check off \(\.$habit) in \(.applicationName)", "\(\.$habit) done in \(.applicationName)".
  - Polish: "Odhacz \(\.$habit) w \(.applicationName)".
  - Add `INAlternativeAppNames` (e.g. "Habits", and "Nawykach" for Polish grammar).
  - Give `HabitEntity` a `DisplayRepresentation` with **synonyms**. An Apple engineer says synonyms matter for App Shortcuts parameter matching. Examples: Spacer → walk/spacerek, Basen → pool/swim, Medytacja → meditation, Czytanie → reading.
- **Shortcuts to ship** (≤10):
  1. `LogHabit` (today).
  2. `LogHabit(day: .yesterday)`, preset in the shortcut. Its phrase must still hold only one parameter.
  3. `AnswerNo`.
  4. `WhatsLeft`: dialog "Zostały: Spacer, Czytanie". On iOS 26+ it can be a `SnippetIntent` interactive snippet with buttons.
  5. Optionally `OpenReview`.
- **Intent behaviour:**
  - The intents reuse the same outbox and device write functions.
  - Default `authenticationPolicy` works while locked.
  - Name matching like the existing function (exact, else a unique prefix of 3+ characters), done locally against the snapshot.
  - The answer is the same "message" text as `/api/log`.
- **Spotlight:** typing "Spacer" offers "Odhacz Spacer" in Polish. That is the realistic zero-setup "Odhacz Spacer".

## 4. Login for extensions (decision needed with the architecture track)
- **Don't share a supabase-swift session through the Keychain** across app, widget, notification and intent processes. Supabase refresh tokens are single-use with a short reuse window (about 10 s by default). A refresh outside that window marks the session terminated and revokes every refresh token in it.
- Instead: the logged-in app mints a **per-device key** (`new_device_token(label)`) and stores it in the shared Keychain (AfterFirstUnlock). Extensions call these server functions with it, all idempotent:
  - `device_complete(p_token, p_habit_id, p_date, p_request)` = `value = greatest(coalesce(value, 0), target)`, `skipped = false`;
  - `device_answer_no(...)` = 0 only if no positive value exists;
  - `device_add(..., p_delta, p_request)` uses the `entry_adds` dedupe;
  - `device_clear(...)`.
- `GET /api/native/snapshot` on Vercel uses the same key. The main app can keep a normal Supabase session for its own UI.

## 5. Setup checklist (Xcode)
- **Targets:** App, WidgetExtension (widgets + controls), NotificationContentExtension; NSE later.
- **One App Group + one Keychain access group** on every target.
- **Capabilities:** Push Notifications (app and widget extension: Apple says to add it to the widget extension for widget push), Time Sensitive Notifications, Background Modes (remote notifications, background fetch), and the HealthKit background capability from the other track.
- Put the intents in the shared package, and make sure the widget extension and the app both include them.
- Verify `aps-environment` matches the stored `environment`.

## Risks

- Supabase Edge Runtime may not use HTTP/2 to api.push.apple.com. Nobody has publicly confirmed it. Mitigation: a 30-minute test, and if it fails, a Vercel Node.js route using node:http2.
- APNs login token (JWT) refresh rules: a token older than 60 minutes gives 403 ExpiredProviderToken, and refreshing more than once per 20 minutes on the same connection gives 429 TooManyProviderTokenUpdates. Signing on every 5-minute cron run risks the 429. Cache the token in memory and in the database for about 50 minutes.
- APNs environment mismatch: Xcode builds use sandbox tokens, TestFlight builds use production, and keys are now environment-scoped. A mismatch shows up as BadDeviceToken. Store the environment with each token and select the host and key from it.
- Login across processes: if the app, widget and notification extension share one rotating Supabase session, refresh-token reuse detection can revoke it and log the owner out silently. Use a per-device API key. This requires changing api_tokens, which today allows one key per user (user_id is the primary key), so a new key would kill the Shortcut key.
- Duplicate notifications: the PWA Web Push subscription and APNs would both alert the same iPhone. Mitigation: pause iPhone Web Push subscriptions while an APNs device is active, and turn them back on when APNs reports the device gone (410).
- Widget buttons do nothing on a locked phone (Apple docs). Lock Screen widgets are glance-only, and only Controls and notification buttons work without Face ID. Those then must read the device key with AfterFirstUnlock Keychain accessibility.
- Widget freshness is budgeted and opportunistic: widget push is delivered best-effort, reloads triggered from a notification extension are reported unreliable, and reloads while the app is in the foreground are throttled. After a PWA edit the widget can stay stale for minutes.
- Optimistic widget or notification writes can diverge from the server, for example after a date error or a conflict with a HealthKit value. Writes need absolute, idempotent semantics (done = max(value, target)) and a visible sync-error state.
- Siri: no Polish voice Siri in iOS 27, and the new Siri AI is not available in the EU. App Shortcuts must be in the owner's Siri language, English speech recognition of Polish habit names needs synonyms, and there are hard limits (10 shortcuts, app name in every phrase, one parameter per phrase).
- SQLite in the App Group folder can get the app killed (0xdead10cc) if its lock is held while the app is suspended. Use atomic JSON files, one file per outbox entry.
- Interruption level time-sensitive can be turned off per app by the user. The 09:00 'yesterday' push can still land in Scheduled Summary.
- Changing the rule that skips Apple Health habits in reminders, once HealthKit syncs in real time, risks nagging about habits already done if HealthKit delivery lags.

## Open questions

- Which language is Siri set to on the owner's iPhone? It decides the App Shortcuts phrase language, since Polish voice Siri does not exist.
- Will the PWA stay on the iPhone home screen? Is it OK to pause iPhone Web Push automatically while the native app is registered, keeping desktop Web Push?
- Distribution: an Xcode-installed development build (sandbox APNs, profile valid for a year) or TestFlight (production APNs, builds expire after 90 days)? This decides which APNs key and environment to set up first.
- Does the iPhone have an Action Button (15 Pro or later)? It decides whether a 'Czytanie' or 'Medytacja' Control on the Action Button is worth building early.
- Main app architecture (SwiftUI native vs a Capacitor 8 shell)? Widgets, controls, intents and notification extensions are native Swift targets either way, but it changes where the notification delegate and the outbox flush live.
- Widget snapshot computation: a Vercel route reusing lib/domain (my preference) or a Swift port? This depends on the data-layer and offline decision.
- For count/duration habits (Czytanie 5 pages, Ruch 30 min), should 'Zrobione' in a notification or widget record the full target (my default), or should those habits only offer +N or open the app?
- Is it acceptable that Controls and notification buttons record habits on a locked phone without Face ID? This is a privacy trade-off.
- Once HealthKit background sync is live, should Apple Health habits (Ruch, Spacer) be included in reminders with progress, gated on fresh health_daily data?

## Sources

- https://developer.apple.com/tutorials/data/documentation/usernotifications/establishing-a-token-based-connection-to-apns.md
- https://developer.apple.com/tutorials/data/documentation/usernotifications/sending-notification-requests-to-apns.md
- https://developer.apple.com/tutorials/data/documentation/usernotifications/handling-notification-responses-from-apns.md
- https://developer.apple.com/tutorials/data/documentation/usernotifications/declaring-your-actionable-notification-types.md
- https://developer.apple.com/tutorials/data/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications.md
- https://developer.apple.com/documentation/widgetkit/widgetpushhandler.md
- https://developer.apple.com/tutorials/data/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities.md
- https://developer.apple.com/tutorials/data/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system.md
- https://developer.apple.com/tutorials/data/documentation/widgetkit/updating-controls-locally-and-remotely.md
- https://developer.apple.com/videos/play/wwdc2026/277
- https://developer.apple.com/videos/play/wwdc2026/8011/
- https://developer.apple.com/tutorials/data/documentation/appintents/appshortcutsprovider.md
- https://developer.apple.com/tutorials/data/documentation/appintents/appintent/authenticationpolicy.md
- https://developer.apple.com/documentation/appintents/snippetintent.md
- https://developer.apple.com/forums/thread/779109
- https://developer.apple.com/forums/thread/832294
- https://developer.apple.com/forums/thread/718600
- https://developer.apple.com/forums/thread/725080
- https://developer.apple.com/forums/thread/773827
- https://developer.apple.com/forums/thread/669736
- https://developer.apple.com/forums/thread/652946
- https://developer.apple.com/forums/thread/121795
- https://docs.deno.com/examples/fetch_data_tutorial/
- https://docs.deno.com/api/node/http2
- https://newreleases.io/project/github/denoland/deno/release/v2.7.13
- https://github.com/enyiasonye/kitchenmate/issues/28
- https://supabase.com/docs/guides/functions/examples/push-notifications
- https://supabase.com/docs/guides/auth/sessions
- https://www.guardlayer.io/blog/supabase-invalid-refresh-token-already-used
- https://mjtsai.com/blog/2026/09/15/xcode-27/
- https://dev.classmethod.jp/en/articles/ios-dev-weekly-changes-20260918/
- https://thinkapple.pl/2026/09/16/siri-po-polsku-w-ios-27-na-iphone-dostepna-siri-pl/
- https://antyweb.pl/nowa-siri-nie-dla-polaka-ale-ios-27-i-tak-jest-fajny-co-sie-zmieni
- https://antyweb.pl/ios-27-2-trzecia-beta
- https://www.androidauthority.com/ios-27-extra-large-widgets-3675846/
- https://experienceleague.adobe.com/en/docs/journey-optimizer/using/channels/live-activity/mobile-live-faq
- https://blogs.apievangelist.com/blogs/ionic-2025-12-09-announcing-capacitor-8/
- https://www.plushcap.com/content/ionic/blog/ionic-the-road-to-capacitor-9
- Repo: /home/user/habit-tracker/supabase/functions/send-reminders/logic.ts
- Repo: /home/user/habit-tracker/supabase/functions/send-reminders/src.ts
- Repo: /home/user/habit-tracker/app/api/log/route.ts
- Repo: /home/user/habit-tracker/lib/domain/today.ts
- Repo: /home/user/habit-tracker/supabase/migrations/20261023120000_health_ingest.sql (api_tokens.user_id primary key)
- Repo: /home/user/habit-tracker/supabase/migrations/20261025090000_audit_fixes.sql (log_habit adds, add_entry p_request)
- Repo: /home/user/habit-tracker/public/sw.js
