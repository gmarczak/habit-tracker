# Notatki badawcze: Zmiany w backendzie

_Materiał źródłowy do `docs/ios/PLAN.md` (stan na 2026-10-25, po angielsku). Gdy plan i notatki się różnią, obowiązuje plan._

## Summary

- **Current state, checked against production.** The token APIs (`api_tokens`, `/api/log`, `/api/ingest`) have never been used: `api_tokens` and `health_daily` both have 0 rows. They can be extended or retired at no risk. The PWA has 1 web push subscription, 3 reminders and 12 habits. Vercel functions run in **iad1 (US East)** while Supabase is in **eu-central-1**, so every Next.js API query crosses the Atlantic. Move functions to fra1 first.
- **Login and sessions.** Only the main app process holds a Supabase session (supabase-swift 2.55.x). It must never be shared with the widget or other extensions. supabase-swift dedupes refreshes only inside one process, and `session()` refreshes on demand. Supabase treats reuse of a refresh token more than 10 s after rotation as theft and revokes the whole session. Native sign-out must use `signOut(scope: .local)`: the SDK default is `.global`, which would also log out the PWA and the other apps (swim, finance, garage) that share this auth project.
- **Device secret for extensions.** Add a `devices` registry plus a `device_secrets` table (SHA-256 hash only). `register_device()` is called once with the user JWT and returns a 256-bit `nwk_…` secret. It goes in a shared Keychain access group with `AfterFirstUnlockThisDeviceOnly`. The widget, notification actions, HealthKit background work and Screen Time all authenticate with this secret. It never rotates on its own, is limited to habit data, and can be revoked from the PWA.
- **One native API.** A small Next.js `/api/v1` (`GET today`, `POST entries`, `POST health`, `PUT device/push`) calls new SECURITY DEFINER RPCs that check the device secret (`device_snapshot`, `device_apply_entries`, `device_ingest_health`, `device_set_push`). The server computes the Today view with the existing `lib/domain`, so streaks, "never miss twice", weekly plans and comeback logic stay in TypeScript only. Swift only renders the result and makes simple optimistic toggles.
- **Writes from the device are batch operations.** Each op is idempotent (`op_id`, reusing `entry_adds`) and checked for staleness (`client_at` against `habit_entries.updated_at`). There is a new op kind `complete` that sets the target value on the server, which the "Zrobione" button and the widget need. Ops carry the server-provided date, never the phone's clock. Each response includes the fresh Today view, so a widget tap costs one round trip.
- **New columns for automatic data.** `habit_entries.origin` and `device_id` record who wrote an entry, so the "silence" check can tell manual from automatic entries. Without `origin`, Screen Time (Duolingo) entries would wrongly count as manual activity. New health metrics `swim_workouts` and `swim_min` are needed for Basen: the existing `workouts` metric counts every workout. `health_daily.measured_at` lets native HealthKit totals be replaced only by newer values. `devices.health_synced_through` keeps the 09:00 "yesterday" push from nagging about health-tracked habits that haven't synced yet.
- **APNs goes into the existing `send-reminders` Edge Function.** It signs ES256 JWTs with WebCrypto, keeps the token in module memory for 50 min (APNs rejects a new token more than once per 20 min on the same connection), and uses the sandbox or production host per device. Payloads carry `aps.category` and `habitIds`/`date` for the "Zrobione" / "Wszystko zrobione" actions. A new `profiles.push_target` setting (`web`/`native`/`both`, default `web`) prevents duplicate pushes during the transition.
- **Every migration is additive and PWA-compatible.** Existing RPC signatures stay; `set_entry`, `add_entry` and `log_habit` only start recording `origin`. The PWA needs one new Settings section ("Urządzenia": device list, revoke, push target) and updated metric lists. That PWA update must ship before any habit uses the new sources, or editing such a habit in the PWA would erase its source.
- **Migration history drift.** Production's migration versions differ from the repo filenames. The manual cleanup migration was never recorded, and other apps' migrations (swim, finance, garage) are in the same history. Keep applying through `apply_migration` / SQL Editor and record the versions; don't run `supabase db push` blindly.
- **Optional extras.** WidgetKit push (iOS 26: `apns-push-type: widgets`, budgeted by the system) is only needed for writes from the PWA or Siri. Native writes reload widgets locally. Treat it as phase 3.

## Recommendation

Keep Supabase plus `lib/domain` as the single source of truth and change the backend only by adding to it. My order:

1. **Move Vercel functions to fra1.**
2. **Add the device layer.** Create `devices` and `device_secrets`, and add `profiles.push_target`, `habit_entries.origin` and `device_id`. Then add the device RPCs (`register_device`, `device_snapshot`, `device_apply_entries`, `device_ingest_health`, `device_set_push`, `revoke_device`) and the SQL tests for them.
3. **Ship `/api/v1` on Next.js.** It covers today, entries, health and device/push, authenticated with a per-device secret. Exclude it from the `proxy.ts` matcher.
4. **Teach `send-reminders` to send APNs.** Add categories and `habitIds` for "Zrobione", gated by `push_target`.
5. **Add `swim_workouts`/`swim_min` and `health_synced_through`** for background HealthKit.

Only the main app holds a Supabase session: Keychain storage that is not shared, `signOut(scope: .local)`. All extensions and background paths use the device secret, never the refresh token. Swift never re-implements streak or schedule logic: it renders the server's Today payload and queues idempotent ops in an App Group outbox. Retire the Shortcut token API (`api_tokens`, `log_habit`, `token_habits`, `ingest_metrics`) once the native app has been stable for a few weeks. It is unused today.

## Effort

7-9 days of backend work, iOS client excluded: M1+M2+M4 RPCs with SQL tests ~2.5 d; /api/v1 with todayPayload and vitest ~1.5 d; APNs in send-reminders (JWT, environments, categories, test mode) ~2 d; M3 health v2, origin-aware domain code and health-aware "yesterday" ~1.5 d; Vercel region, PWA "Urządzenia" section, docs ~0.5–1 d. Optional widget push +1 d, Shortcut API retirement +0.5 d.

## Details

## 1. Audit: what exists now (repo and live project)

| Area | Finding | Consequence for native |
|---|---|---|
| Tables (`supabase/migrations/*`) | `profiles`, `habits` (`source`/`source_min`/`goal`/`time_of_day`/`cue`/`why`), versioned `habit_plans`, `habit_entries` (one per habit per day, `updated_at` trigger), `habit_pauses`, `reminders` (kind enum), `push_subscriptions` (Web Push only), `notification_log` (service role only), `day_notes` (+mood), `api_tokens` (**one token per user**, `user_id` is the PK), `health_daily`, `entry_adds` (idempotency ids for `add_entry`). RLS `own_rows` everywhere. | Good base. Nothing stores native devices, APNs tokens, or who/what wrote an entry. |
| Live row counts (Supabase MCP) | `api_tokens` 0, `health_daily` 0, `push_subscriptions` 1, `habits` 12, `habit_entries` 14. | The Shortcut/Health token path was never used, so there is no compatibility burden. |
| Token RPCs | `token_owner`, `token_habits`, `log_habit`, `ingest_metrics`: SECURITY DEFINER, callable by anon, check `sha256(token)`. | Good pattern to copy for device secrets. The advisor flags them (WARN 0028); that is intentional and documented. |
| `/api/log`, `/api/ingest` | Bearer `ht_…`, anon supabase-js client + RPC, zod-like parsing in `lib/domain/health.ts`. **No rate limiting.** Tokens carry about 244 bits of randomness, so guessing is infeasible; abuse would only cost money. | Reuse `lib/server/shortcut.ts` helpers (`bearerToken`, `fail`). |
| `proxy.ts` | Runs `getClaims()` on every matched path and redirects to `/login` unless the path is in `PUBLIC_PATHS`. | `/api/v1/*` must be excluded in the `matcher`. Otherwise cookie-less native calls get a 302 to HTML, plus a wasted Supabase call per request. |
| `lib/data/snapshot.ts` | Client loads everything (9 parallel queries, entries paged by 1000, health for 120 days). Mappers `toHabit`/`toEntry`/`toPlan` take raw rows. | The server-side Today view can reuse these mappers on JSON rows from one RPC. |
| `send-reminders/src.ts` | pg_cron every 5 min, secret from Vault via `push_config`, per-user domain computation (bundles `lib/domain`), claims `notification_log`, then Web Push; deletes subscriptions on 404/410; `continue`s when the user has no web subscriptions. | Add an APNs channel here. The early `continue` must also consider devices. |
| `lib/domain/nudges.ts` `manualDates()` | Treats any entry of a habit with `source` as automatic. | Breaks once automatic writes can target any habit (Screen Time) or a manual edit hits an auto habit. Per-entry `origin` is needed. |
| Health metrics | `workouts` = count of **all** workouts. | Basen needs `swim_workouts` (and optionally `swim_min`). |
| Vercel (MCP) | Latest production deployment `regions: ["iad1"]`. SSO protection `all_except_custom_domains`. | Move to **fra1** ([Vercel regions](https://vercel.com/docs/functions/configuring-functions/region)). The native base URL must be `https://nawyki.gmarczak.xyz`; preview testing needs the protection-bypass header. |
| Supabase project | Postgres 17.11, pgcrypto in `extensions`, pg_net 0.20.4, pg_cron 1.6.4. Shared with the `swim`, finance and garage apps (same `auth.users`). Production migration versions differ from repo filenames, `cleanup` was never recorded, and other apps' migrations are interleaved. | Apply via MCP `apply_migration` / SQL Editor and record versions. Never `supabase db push` without `migration repair`. A global sign-out would kill sessions in the other apps too. |
| Constraint names (verified live) | `habits_source_check`, `health_daily_metric_check`. | Safe to drop and re-add by name. |

## 2. Target architecture

```
iPhone
  Main app process (UI, notification actions, HealthKit background delivery, BGTasks)
    - Supabase session (supabase-swift, app-private Keychain) -> PostgREST/RPC with RLS
      (habit CRUD, settings, register_device)
    - device secret (shared Keychain group) -> https://nawyki.gmarczak.xyz/api/v1/*
  Widget extension + its AppIntents (runs in the widget process by default)
    - device secret -> /api/v1/entries, /api/v1/today
  DeviceActivityMonitor extension (6 MB, synchronous)
    - writes ops to the App Group outbox only; no network
  App Group: outbox.jsonl, today.json (cached payload)

Vercel fra1 /api/v1/*  ->  Supabase RPC device_*  (SECURITY DEFINER, check sha256(secret))
                            then lib/domain buildDay/streakOf/yesterdayGap -> TodayPayload v1
Supabase pg_cron -> send-reminders -> Web Push (PWA) and/or APNs (alert; widgets later)
```

**Why the native API lives on Next.js and not a new Edge Function.** `lib/domain` and `snapshot.ts` mappers import directly, with no Deno bundling. Vitest covers it. Deploys happen on git push. The PWA already shares Vercel's failure domain. One condition: set the region to fra1.

## 3. Auth and session design (the refresh-rotation problem)

- **Supabase refresh tokens are single-use.** The reuse interval defaults to 10 s. Reuse outside that window means the whole session is terminated and all its refresh tokens are revoked ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)).
- **supabase-swift makes sharing tempting, and it is unsafe.** `KeychainLocalStorage(accessGroup:)` invites sharing one session between app and widget. But `SessionManager.session()` refreshes on demand whenever the access token has expired, and in-flight deduping is a per-process actor dictionary. Two processes, two refreshes of the same token, and the session gets revoked.
- **Rule 1: only the main app refreshes.** It uses `KeychainLocalStorage()` with no access group. Do not configure an access group for the session, even though the SDK supports it. (supabase-swift stores items with `kSecAttrAccessibleAfterFirstUnlock`, so background wakes on a locked phone still work.)
- **Rule 2: everything that can run concurrently or unattended uses the device secret.** That means the widget intents, DeviceActivityMonitor, the notification-action handler and HealthKit observers. Only the widget and DeviceActivityMonitor are truly separate processes, but sending all unattended writes through one path keeps things simple. The device secret:
  - is `nwk_` plus 64 hex characters from `extensions.gen_random_bytes(32)`; only `sha256` is stored;
  - lives in its own Keychain item (service `xyz.gmarczak.nawyki.device`) in access group `$(AppIdentifierPrefix)xyz.gmarczak.nawyki.shared`. Add that group to the `keychain-access-groups` entitlement of the app, widget, monitor and any notification service extension;
  - uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. That covers locked-phone background work, and the secret never syncs to iCloud Keychain or restores to another phone; after a restore the app simply re-registers.
- **Rotation is done only by the main app**, through `register_device` (with the JWT) or `rotate_device_secret`. The previous hash stays valid for 10 minutes (`prev_hash`, `prev_valid_until`), so an extension mid-request isn't cut off.
- **Limit what a leaked secret can do.** Device RPCs can read habits, plans, entries, pauses, moods (no note text) and recent health. They can write entries for the last 30 days and health data, and register push tokens. They cannot delete habits, change settings or delete the account. The PWA Settings get an "Urządzenia" list with `last_seen_at`, `health_synced_through` and a revoke button.
- **Native sign-out:** `signOut(scope: .local)`, because the supabase-swift default is `.global`. Then call `revoke_device(id)`.
- **Password change in the PWA** ends the other sessions. The native app then asks for login again, while the device secret keeps extensions working. Optionally add a trigger that revokes devices on password change.
- **If any PWA screens are embedded in a WKWebView,** that webview logs in on its own (cookie session). Never inject the native refresh token into it: that creates two refreshers on one session.

## 4. Data model (new and changed)

**M1 `20261026090000_native_devices.sql`**

```sql
create table public.devices (
  id uuid primary key,                        -- UUID created by the app, kept in Keychain
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null default 'ios' check (platform = 'ios'),
  name text check (char_length(name) <= 80),
  bundle_id text not null check (bundle_id ~ '^[A-Za-z0-9.-]{1,155}$'),
  app_version text check (char_length(app_version) <= 40),
  os_version text check (char_length(os_version) <= 40),
  apns_token text unique check (apns_token ~ '^[0-9a-f]{64,256}$'),
  apns_env text check (apns_env in ('sandbox','production')),
  widget_push_token text unique check (widget_push_token ~ '^[0-9a-f]{64,256}$'),
  push_enabled boolean not null default true,
  capabilities jsonb not null default '{}' check (jsonb_typeof(capabilities) = 'object'), -- {"healthkit":true,"screentime":false}
  health_synced_through date,                 -- last fully finished day whose HealthKit totals were sent
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  unique (id, user_id)
);
create index devices_user_idx on public.devices (user_id) where revoked_at is null;

create table public.device_secrets (
  device_id uuid primary key references public.devices (id) on delete cascade,
  secret_hash bytea not null unique,
  prev_hash bytea unique,
  prev_valid_until timestamptz,
  rotated_at timestamptz not null default now()
);

alter table public.devices enable row level security;
alter table public.device_secrets enable row level security;            -- no policies: definer functions only
create policy own_devices on public.devices for select to authenticated using (user_id = (select auth.uid()));
-- no insert/update/delete policies: writes go only through the RPCs below

alter table public.profiles add column push_target text not null default 'web'
  check (push_target in ('web','native','both'));
```

**RPCs in M1:**
- `register_device(p_device_id uuid, p_bundle_id text, p_name text default null, p_app_version text default null, p_os_version text default null) returns text`, SECURITY DEFINER, authenticated only.
  - Raises `not_authenticated` if `auth.uid()` is null.
  - Upserts into `devices` with `ON CONFLICT (id) DO UPDATE … WHERE devices.user_id = v_uid`; raises `device_taken` if no row was affected. Clears `revoked_at`.
  - Upserts `device_secrets`, moving the old hash to `prev_hash` with `prev_valid_until = now() + 10 min`, but only if the device wasn't revoked.
  - Returns the plaintext secret once.
- `device_owner(p_secret text, out uid uuid, out did uuid, out today date)`, internal (EXECUTE revoked from public, anon and authenticated).
  - Matches `secret_hash`, or `prev_hash` while still within its grace window.
  - Requires `revoked_at IS NULL`.
  - Computes `today` like `token_owner`.
  - Updates `last_seen_at` at most every 5 minutes.
  - Raises `invalid_device` (28000).
- `device_set_push(p_secret, p_apns_token text, p_apns_env text, p_widget_push_token text default null)`, anon-executable definer. Nulls the same token on any other device row first, because a reinstall creates a new device id.
- `revoke_device(p_device_id uuid)`, authenticated. Sets `revoked_at`, nulls the tokens, deletes the secret.
- `rotate_device_secret(p_secret) returns text`, anon definer (optional).

**M2 `20261026091000_entry_origin.sql`**

```sql
alter table public.habit_entries
  add column origin text check (origin in ('web','app','widget','notification','siri','shortcut','health','screen_time')),
  add column device_id uuid references public.devices (id) on delete set null;
create index habit_entries_device_idx on public.habit_entries (device_id) where device_id is not null;
```

- `create or replace` `set_entry` / `add_entry` with **unchanged signatures**, setting `origin = 'web'` in both the insert and the `ON CONFLICT` update. Today a manual PWA edit of an auto entry would keep `origin = 'health'`.
- `log_habit` sets `'siri'`; `ingest_metrics` sets `'shortcut'`.
- Rows with `null` origin mean "legacy". The domain falls back to `habit.source` for them.

**M3 `20261026092000_health_v2.sql`**

```sql
alter table public.habits drop constraint habits_source_check, add constraint habits_source_check
  check (source in ('steps','distance_km','exercise_min','active_kcal','mindful_min','water_ml','workouts',
                    'swim_workouts','swim_min','app_usage'));
alter table public.health_daily drop constraint health_daily_metric_check, add constraint health_daily_metric_check
  check (metric in ('steps','distance_km','exercise_min','active_kcal','mindful_min','water_ml','workouts',
                    'swim_workouts','swim_min')),
  add column measured_at timestamptz,
  add column device_id uuid references public.devices (id) on delete set null;
```

- **Refactor the `ingest_metrics` body** into internal `_ingest_core(p_uid uuid, p_metrics jsonb, p_date date, p_origin text, p_device uuid, p_measured_at timestamptz) returns jsonb` (EXECUTE revoked from all API roles). Keep `ingest_metrics(p_token, p_metrics, p_date)` as a thin wrapper so the signature is unchanged.
- **`health_daily` upsert rule.** With `p_measured_at` (native), replace the value only if newer: HealthKit totals can be revised down after Watch/iPhone dedupe. Without it (Shortcut), keep `greatest()`.
- **Habit entries rule.** Keep `greatest()` for count/duration, so a manual timer addition is never lowered. Skip `app_usage` habits in the habit loop.
- **Decide one inconsistency** (see open questions). Today a check habit with "Nie dziś" (value 0) is never upgraded by health data (`DO NOTHING`), while a duration habit is (`greatest(0, x)`). Recommendation: upgrade value 0 to 1 for check habits too, and never touch `skipped`.

**M4 `20261026093000_device_api.sql`** (all `SECURITY DEFINER`, `set search_path = ''`, `GRANT EXECUTE TO anon`, revoked from `public`)

1. **`device_snapshot(p_secret text) returns jsonb`**: one round trip instead of 9 queries. It returns:
   - `profile`: timezone, week_start, day_start_hour, push_target;
   - `habits`: all, via `to_jsonb`;
   - `plans`;
   - `entries`: all, but only habit_id, entry_date, value, skipped, origin, with **no note text**. Streak computation walks back to `start_date`, so full history is needed; it is about 3k rows per year;
   - `pauses`;
   - `notes`: last 60 days, `note_date` and `mood` only (for `absence()`);
   - `health`: last 8 days;
   - `device`: id, health_synced_through;
   - `today`.
2. **`device_apply_entries(p_secret text, p_ops jsonb) returns jsonb`**. At most 200 ops. Each op runs in its own `BEGIN … EXCEPTION` block (subtransaction):
   - **Op shape:** `{op_id uuid, habit_id, date, kind, value?, delta?, client_at?, origin}`.
   - **Kinds:** `set`, `add`, `complete`, `no` ("nie dziś" = value 0), `skip`, `clear`. `complete` sets 1 for check habits, otherwise `greatest(current, target)`, with the target taken from the plan valid on that date, like `log_habit`. It is rejected for `goal = 'quit'`.
   - **Origin:** must be one of `app`, `widget`, `notification`, `siri`, `health`, `screen_time`.
   - **Habit check:** the habit must belong to the device owner, and `date` must be within `[greatest(start_date, today - 30), today]`.
   - **Idempotency:** `INSERT INTO entry_adds (id, user_id) … ON CONFLICT DO NOTHING`; a repeat returns `duplicate`. `user_id` must be explicit, because `auth.uid()` is null in definer context.
   - **Stale guard** (all kinds except `add`): if the existing row's `updated_at > client_at`, return `stale` and do not overwrite a newer PWA or other-device write.
   - **Writes** set `user_id`, `origin` and `device_id` explicitly.
   - **Result:** `{today, results:[{op_id, status: ok|duplicate|stale|error, error?}]}`.
3. **`device_ingest_health(p_secret text, p_days jsonb) returns jsonb`**. At most 35 days. Each day looks like `{date, metrics:{steps,exercise_min,mindful_min,swim_workouts,…}, measured_at, final}`. It loops `_ingest_core(…, 'health', did, measured_at)`. For days marked final it sets `devices.health_synced_through = greatest(…, date)`.

Screen Time needs **no extra endpoint**. The monitor writes a `complete` op with `origin: 'screen_time'` to the App Group outbox, and the next process with network flushes it. The habit is configured server-side as `source = 'app_usage'` with `source_min` = minutes threshold; the opaque `FamilyActivitySelection` tokens stay on the device, keyed by `habit_id`.

**Later, optional:**
- **M5 `widget_push`** (phase 3). A statement-level trigger on `habit_entries` calls `net.http_post` to a `widget-push` Edge Function. It skips writes from the same device's widget origin and is debounced to one push per 60 s, because widget pushes are budgeted.
- **M6 `retire_shortcut_api`**. Drop `api_tokens`, `log_habit`, `token_habits` and the `ingest_metrics` wrapper once native App Intents cover Siri. This also clears three advisor warnings.

## 5. `/api/v1` contract (Next.js, `app/api/v1/**/route.ts`)

**Setup**
- **Auth header:** `Authorization: Bearer nwk_…`. Requests without `nwk_` get 401. Reuse `fail()` and `bearerToken()` from `lib/server/shortcut.ts`, generalised.
- **Supabase client:** anon/publishable key; no service role on Vercel.
- **Responses:** `Cache-Control: no-store`. Body limit 64 KB.
- **Validation:** zod schemas in `lib/server/native.ts`.
- **Next 16:** read `node_modules/next/dist/docs/` before writing route code (repo `AGENTS.md`).

| Method / path | Body | Returns |
|---|---|---|
| `GET /api/v1/today?date=YYYY-MM-DD` | – | `TodayPayload`; `date` defaults to today and may be yesterday for the review widget |
| `POST /api/v1/entries` | `{ops:[…]}` | `{results, today: TodayPayload}`: the widget gets its new state in one round trip |
| `POST /api/v1/health` | `{days:[…]}` | `{updated, today}` |
| `PUT /api/v1/device/push` | `{apnsToken, apnsEnv, widgetPushToken?}` | 204 |

**`TodayPayload` v1** is built by a new pure function `lib/domain/todayPayload.ts` (tested with vitest) from `buildDay`, `streakOf`, `yesterdayGap`, `absence`, `badgeCount`, `healthValue`:

```json
{"v":1,"date":"2026-10-25","today":"2026-10-25","generatedAt":"…Z","nextDayStartsAt":"2026-10-25T22:00:00Z",
 "progress":{"done":2,"total":5},"badge":3,
 "items":[{"habitId":"…","name":"Medytacja","icon":"brain","color":"violet","kind":"duration","unit":"min",
   "goal":"build","section":"todo|thisWeek|done|quit","state":"pending|partial|done|skipped|open",
   "value":2,"target":5,"answeredNo":false,"missedLast":true,"streak":{"current":4,"unit":"days"},
   "week":{"done":1,"required":2}|null,"timeOfDay":"morning","auto":{"source":"mindful_min","value":2,"min":null}|null}],
 "yesterday":{"date":"2026-10-24","missingHabitIds":["…"],"done":3,"total":6}|null,
 "comeback":{"days":9}|null}
```

**What Swift is allowed to do:**
- Render this payload.
- Make optimistic changes only: flip check habits done/not done, apply `+delta`, and apply `complete` (set value to target).
- Use the payload's `date` for ops.
- Schedule a timeline reload at `nextDayStartsAt`. The profile timezone is authoritative, which keeps travel and day-start edge cases on the server.

If offline statistics are ever needed in the app, the same esbuild bundle that `send-reminders` uses can run in JavaScriptCore. That is an escape hatch, not v1.

## 6. Notifications: APNs in `send-reminders`

- **Data.** Load `devices` per user (`revoked_at IS NULL AND apns_token IS NOT NULL AND push_enabled`). Change the `subs.length === 0` early exit to also check devices. Route by `profiles.push_target`. Default `web` changes nothing; during testing use `both`; at cut-over use `native`.
- **`logic.ts` `Message` gains `habitIds: string[]` and `actionDate`.**
  - Category `HABIT_ONE` (one habit; actions "Zrobione" → op `complete`, "Nie dziś" → op `no`).
  - Category `HABIT_MANY` ("Wszystko zrobione" covers only items required today, not weekly ones; plus "Otwórz").
  - Category `YESTERDAY` ("Wszystko zrobione" for `gap.date`, plus "Uzupełnij").
  - Category `INFO` for weekly and comeback messages.
  - These are pure functions with unit tests.
- **Payload:** `{"aps":{"alert":{"title","body"},"badge":n,"sound":"default","category":"HABIT_ONE","thread-id":tag},"date":"…","habitIds":[…],"url":"/review?date=…"}`. Actions run in the app process launched in the background, possibly on a locked phone ([Apple: actionable notifications](https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types)). That is why the device secret and outbox must be readable after first unlock.
- **Headers:**
  - `apns-push-type: alert`;
  - `apns-topic: <bundle id>`;
  - `apns-priority: 10` (5 for weekly);
  - `apns-collapse-id: <tag>-<date>`;
  - `apns-expiration`: end of the local day, because "yesterday" pushes are useless later.
- **Host per device:** `api.sandbox.push.apple.com` for Xcode development builds, `api.push.apple.com` for TestFlight and production ([Apple: sending requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)). New team keys are environment-specific ([token-based connection](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)).
- **Secrets.** Store them as Edge Function secrets: `APNS_KEY_SANDBOX` / `APNS_KEY_PRODUCTION` (.p8 contents), `APNS_KEY_ID_*`, `APNS_TEAM_ID`, `APNS_TOPIC`. They don't need to be SQL-readable like the VAPID keys.
- **JWT:**
  - import the key with `crypto.subtle.importKey('pkcs8', …, {name:'ECDSA', namedCurve:'P-256'})`;
  - sign with ECDSA/SHA-256; WebCrypto's raw r||s output is already the JWS ES256 format;
  - cache per environment in module scope for 50 min. Apple: refresh no more than once every 20 min on the same connection, and `iat` older than 1 h is rejected with 403 `ExpiredProviderToken`. A warm isolate reuses pooled connections, so don't mint a token per invocation.
- **Errors.** On 410 `Unregistered` or 400 `BadDeviceToken`, set `apns_token = null` (this also catches environment mismatches). Count deliveries across both channels for the existing `notification_log` release-on-zero logic.
- **HTTP/2.** Deno `fetch` negotiates h2 via ALPN ([Deno docs](https://docs.deno.com/examples/fetch_data_tutorial/)). Verify against sandbox from the Supabase edge runtime on day 1. Fallback: a Vercel Node route using `node:http2`, called by the function.
- **Test mode.** Extend `test_user_id` so it also sends one APNs push per device and returns `apns-id` and status.
- **Health-aware "yesterday".** Pass `healthSyncedThrough` (max over the user's devices) into `UserContext`. In `yesterday`, drop items whose habit has a health source when `healthSyncedThrough < gap.date`. HealthKit background delivery is throttled (steps at most hourly, [Apple](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:))). Developer forum reports say it doesn't fire while the phone is locked ([forum](https://developer.apple.com/forums/thread/730202)), so the 09:00 push can arrive before the night's totals.
- **WidgetKit push (phase 3).** `apns-push-type: widgets`, topic `<bundle>.push-type.widgets`, `{"aps":{"content-changed":true}}`. The token comes from `WidgetPushHandler.pushTokenDidChange` and is stored in `devices.widget_push_token`. These pushes are budgeted and delivered opportunistically ([Apple](https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications)).

## 7. Domain-code changes (TypeScript, shared by PWA, API and Edge)

- `model.ts`:
  - `Entry.origin?: EntryOrigin`;
  - `AutoSource = HealthMetric | 'app_usage'`.
- `health.ts`:
  - add `swim_workouts` and `swim_min` with Polish labels;
  - make `parseIngestBody` aware of them;
  - widen the zod `source` enum in `mutations.ts`. **Ship this before any habit gets a new source.** Otherwise the PWA's `toHabit` maps the unknown source to null, and saving the habit in `HabitEditor` writes `source = null`.
- `nudges.ts` `manualDates`: an entry is manual when `origin` is one of `web`, `app`, `widget`, `notification`, `siri`. If `origin` is null, fall back to `habit.source` being null.
- `snapshot.ts`: select `origin` and map it into `Entry`.
- `logic.ts`: categories, `habitIds`, the health-aware yesterday rule.
- New `todayPayload.ts`.
- Rebuild the bundle with `npm run build:functions`.

## 8. Rollout order (PWA keeps working at every step)

1. **Vercel:** set the function region to fra1 and redeploy. PWA smoke test.
2. **Apply M1 + M2 + M4** (additive; existing signatures unchanged except `create or replace` of `set_entry`/`add_entry`/`log_habit`/`ingest_metrics` with the same arguments). Record versions. Add the assertions to `supabase/tests/assertions.sql`:
   - a wrong secret raises 28000;
   - user B's habit gives `habit_not_found` for A's device;
   - duplicate `op_id` gives a single add;
   - the stale guard works;
   - a revoked device is refused;
   - `prev_hash` grace works;
   - B cannot select A's devices;
   - anon cannot read `devices` or `device_secrets`.
3. **Deploy:** `/api/v1` + `proxy.ts` matcher exclusion (`(?!api/v1|…)`), the PWA "Urządzenia" section (list, revoke, `push_target`), and the `origin`-aware domain code.
4. **Native v0 (Xcode dev build):** login, `register_device`, Today, widget with intents, outbox.
5. **`send-reminders` with APNs** (sandbox key). Owner sets `push_target = both`, verifies the actions, then switches to `native`. The PWA web subscription stays as fallback.
6. **Apply M3** together with the health-aware reminder logic. Ship the PWA metric lists first. Then set the sources:
   - Spacer → `steps`, `source_min` 7000 (to confirm);
   - Ruch → `exercise_min` (duration 30);
   - Medytacja → `mindful_min` (duration 5);
   - Basen → `swim_workouts`, `source_min` 1 (weekly_count 2).
7. **Screen Time** `app_usage` habits (development builds; the distribution entitlement needs an Apple request, [forum](https://developer.apple.com/forums/thread/820811)).
8. **Optional:** M5 widget push. After several stable weeks: M6 retirement of the Shortcut API.

## 9. Gotchas

- **DeviceActivityMonitor** has about a 6 MB memory limit and work ends when its synchronous callbacks return ([forum 735454](https://developer.apple.com/forums/thread/735454), [827783](https://developer.apple.com/forums/thread/827783)). It only appends to the outbox; the API must accept late, batched, idempotent ops (up to 30 days back).
- **Interactive widget buttons** run `perform()` in the widget extension process by default, and are inactive on a locked device until it is unlocked ([Apple](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)).
- **App Group files** (outbox, cached Today) need `completeUntilFirstUserAuthentication` protection, not `complete`.
- **Use the server's `today`/`date`.** The phone's timezone can differ from the profile's (`date_in_future` errors otherwise).
- **Don't run `supabase db push`** on this project without `supabase migration repair`.
- **Retention:** prune `entry_adds` (30 days) inside `device_apply_entries` too, as `add_entry` does.

## Risks

- Refresh-token reuse detection: if the widget, a monitor extension or a WKWebView ever refreshes the native Supabase session, Supabase revokes the whole session family and the native app is logged out. Mitigation: only the main app holds the session; everything else uses the device secret.
- supabase-swift signOut() defaults to the .global scope. A careless sign-out would also log out the PWA and the other apps sharing this Supabase auth (swim, finance, garage). Always use .local.
- A static device secret is more powerful than a 1-hour JWT if leaked. Mitigations: 256-bit randomness, hash-only storage, Keychain ThisDeviceOnly, narrow RPC scope (no note text, no deletes or settings), revocation and last_seen_at in the PWA.
- Duplicate notifications on the same iPhone while both the PWA web subscription and native APNs are active. Mitigation: profiles.push_target (default web; both only while testing).
- APNs environment mismatch (Xcode build gets a sandbox token, TestFlight a production token) causes BadDeviceToken or silent failure. Mitigation: store devices.apns_env and use environment-specific keys.
- APNs over HTTP/2 from the Supabase Edge runtime is not yet tested here. Deno documents ALPN h2, but verify early; fallback is a Vercel Node route using node:http2. A new provider JWT on every invocation can trigger TooManyProviderTokenUpdates on reused connections, so cache it for 50 minutes.
- Vercel functions currently run in iad1 while the database is in eu-central-1. Every /api/v1 call pays transatlantic latency per query until the region is moved to fra1.
- Migration history drift: production versions differ from repo filenames, the cleanup migration is unrecorded, and other apps' migrations share the history. supabase db push could try to re-apply old migrations.
- Rollout order trap: if a habit gets a new source (swim_workouts, app_usage) before the PWA knows it, the PWA maps it to null and saving that habit in HabitEditor erases the source.
- HealthKit background delivery is throttled (steps at most hourly) and, per developer reports, doesn't fire while the phone is locked. Without health_synced_through, the 09:00 yesterday push may nag about habits that were actually done.
- Screen Time: the DeviceActivityMonitor extension has a 6 MB limit and synchronous callbacks, so it can't be relied on for network calls. Distribution beyond development builds needs Apple's Family Controls distribution entitlement, which can take long to approve.
- Stale offline writes from the widget outbox could overwrite newer PWA edits. Mitigation: the client_at vs updated_at guard; device clock skew is small but not zero.
- Pre-existing (not caused by native): delete_my_account deletes the shared auth.users row, which also affects the swim, finance and garage apps in the same project.

## Open questions

- Cut-over: should native APNs fully replace PWA web push (push_target = native), or should the PWA stay a fallback channel (both) for some time?
- Auto-detection vs an explicit 'Nie dziś' (value 0): should HealthKit or Screen Time upgrade it to done? Today duration habits are upgraded (greatest) and check habits are not. Recommendation: upgrade both, but never touch a skipped entry.
- Spacer threshold: steps (7000 by default?), or walking workouts / distance_km instead?
- Basen source of truth: HealthKit swimming workouts (swim_workouts), or the separate swim app's swim.workouts table in the same project (currently 0 rows), e.g. via a DB trigger?
- Install path: Xcode development builds (sandbox APNs; Family Controls works in development) or TestFlight (production APNs; builds expire after 90 days; needs the Family Controls distribution entitlement)? This decides which APNs keys to create first.
- Should the native app reuse PWA screens in a WKWebView (separate cookie login), or talk to PostgREST directly with its own session for habit editing and stats?
- Keep the Siri/Shortcut token API (/api/log, /api/ingest) after native App Intents ship, or retire it (M6)? It is unused today.
- Should changing the password in the PWA also revoke all device secrets (trigger on auth.users), or should devices survive password changes?
- Optional 'Sen przed 23:00' automation from HealthKit sleep data would need a '≤' comparator (e.g. habits.source_op), which the current schema can't express. Is it in scope?

## Sources

- /home/user/habit-tracker/supabase/migrations/20261011200033_init.sql
- /home/user/habit-tracker/supabase/migrations/20261023120000_health_ingest.sql
- /home/user/habit-tracker/supabase/migrations/20261024120000_health_daily.sql
- /home/user/habit-tracker/supabase/migrations/20261024150000_siri_cue_mood.sql
- /home/user/habit-tracker/supabase/migrations/20261025090000_audit_fixes.sql
- /home/user/habit-tracker/app/api/log/route.ts
- /home/user/habit-tracker/app/api/ingest/route.ts
- /home/user/habit-tracker/lib/server/shortcut.ts
- /home/user/habit-tracker/lib/data/snapshot.ts
- /home/user/habit-tracker/lib/data/mutations.ts
- /home/user/habit-tracker/lib/domain/nudges.ts
- /home/user/habit-tracker/lib/domain/health.ts
- /home/user/habit-tracker/lib/domain/today.ts
- /home/user/habit-tracker/supabase/functions/send-reminders/src.ts
- /home/user/habit-tracker/supabase/functions/send-reminders/logic.ts
- /home/user/habit-tracker/proxy.ts
- /home/user/habit-tracker/public/sw.js
- Live Supabase project fswfdsooabadlcpekiyx via MCP: list_migrations, list_tables (row counts), get_advisors, pg_constraint names, extension versions
- Live Vercel project gm-habit-tracker via MCP: deployment dpl_57xuzM5DPARCDBToeQgQxoaZNvqv regions [iad1], ssoProtection all_except_custom_domains
- https://supabase.com/docs/guides/auth/sessions
- https://github.com/supabase/supabase-swift/blob/main/Sources/Auth/Storage/KeychainLocalStorage.swift
- https://github.com/supabase/supabase-swift/blob/main/Sources/Auth/Internal/Keychain.swift
- https://github.com/supabase/supabase-swift/blob/main/Sources/Auth/Internal/SessionManager.swift
- https://github.com/supabase/supabase-swift/blob/main/Sources/Auth/AuthClient.swift
- https://github.com/supabase/supabase-swift/blob/main/Sources/Helpers/Version.swift
- https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities
- https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications
- https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types
- https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)
- https://developer.apple.com/forums/thread/730202
- https://developer.apple.com/forums/thread/735454
- https://developer.apple.com/forums/thread/823431
- https://developer.apple.com/forums/thread/827783
- https://developer.apple.com/forums/thread/820811
- https://docs.deno.com/examples/fetch_data_tutorial/
- https://vercel.com/docs/functions/configuring-functions/region
