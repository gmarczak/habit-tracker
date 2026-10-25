# Notatki badawcze: Automatyczne odhaczanie (HealthKit, Screen Time)

_Materiał źródłowy do `docs/ios/PLAN.md` (stan na 2026-10-25, po angielsku). Gdy plan i notatki się różnią, obowiązuje plan._

## Summary

- **HealthKit is the reliable core.** Steps can do all of Spacer's automatic checking. The other four (Ruch, Medytacja, Basen and Sen przed 23:00) can be fully automatic too, but only if an Apple Watch or another app writes that data to Apple Health. Czytanie and the two quit habits stay manual, checked from the widget or the notification action.
- **Background delivery works, with limits.** On iOS, step-count wakes are capped at once per hour. All wakes are best-effort and can be delayed or skipped. iOS never wakes the app while the phone is locked. Delivery stops after a force-quit, and Apple DTS says it stops after about 1–2 weeks of "inactivity". That last point matters a lot for an owner who once went silent for 9 days, so the server has to detect missing syncs and recover.
- **The server already does most of this.** The token-based `ingest_metrics` RPC turns daily totals into checked habits, deciding thresholds from habits.source/source_min, and it is safe to resend. The native app should only compute raw daily totals (today plus the previous 2 days, and 30 days on foreground) and send them with an explicit `p_date`. It should call the RPC directly on Supabase PostgREST with the `ht_` API token from a shared Keychain, not through Vercel and not with the user session.
- **A small server migration is needed.** New metrics: `swims` (the existing `workouts` counts every workout, not only swimming), `sleep_early_min` and `dietary_kcal`. Data from Health should override a "nie dziś" 0 entry. Add an entry `origin` column, because `manualDates` currently guesses this from habits.source. Allow more than one API token so the server can see when the iPhone stops syncing. Optionally add a batch RPC.
- **Fitatu goes through HealthKit, not app-usage tracking.** Fitatu's help centre says it sends meals to Apple Health, so the app reads dietaryEnergyConsumed (optionally only Fitatu's entries). This measures "logged food", which is the real habit. Fitatu has no public API.
- **Duolingo: try the unofficial streak endpoint first.** The server polls it on a schedule (`/2017-06-30/users?username=…&fields=streakData…`). It is cheap and shows whether a lesson was actually done, but it is unsupported and could break at any time.
- **Screen Time (FamilyControls/DeviceActivity) works for personal use but is unreliable.** The development entitlement comes with the paid program and needs no Apple approval for installing from Xcode. TestFlight and Ad Hoc need a separate distribution approval for the app and each extension, which can take hours or weeks. The extension has 6 MB of memory, ends as soon as its callback returns, and can only reach the network through a blocking wait of about 3 seconds. Developers report double, early, missing and spurious threshold events, extensions killed after some days, and authorisation revoked on its own. Treat it as a phase-3 experiment.
- **Platform baseline (verified).** iOS 27 and Xcode 27 shipped mid-September 2026. Xcode 27 needs macOS Tahoe 26.6 or later. supabase-swift is at v2.50.0 (July 2026, iOS 16+ minimum). HealthKit background delivery needs the `com.apple.developer.healthkit.background-delivery` entitlement and must be tested on a real device.

## Recommendation

Make HealthKit background sync the backbone and keep the server as the single place that decides whether a habit is done.

1. **One SyncEngine in the app target.** Write it in native Swift even if the app shell ends up in Capacitor.
   - Register an HKObserverQuery and call enableBackgroundDelivery(.immediate) for: stepCount, appleExerciseTime, mindfulSession, workoutType, sleepAnalysis and dietaryEnergyConsumed.
   - Do this in application(_:didFinishLaunchingWithOptions:).
   - On every wake (HealthKit, BGAppRefresh, foreground, notification action, widget intent), recompute exact per-day totals for today and the 2 previous days. On a foreground launch, recompute the last 30 days.
   - Compute days in profiles.timezone with profiles.day_start_hour.
   - POST each day to PostgREST `rpc/ingest_metrics` with the per-device `ht_` token and an explicit `p_date`. Call the observer's completion handler on every code path.
   - HealthKit itself serves as the queue, so there is no outbox for health data.
2. **One small migration before the app ships.**
   - Add the `swims`, `sleep_early_min` and `dietary_kcal` metrics.
   - For yes/no habits, let Health data upgrade a "nie dziś" 0 entry to 1.
   - Add `habit_entries.origin`, and make `manualDates` use it.
   - Allow several API tokens, each with a device label and `last_used_at`.
   - Add a staleness check in send-reminders: when there has been no iOS sync for more than 30 hours, the 09:00 push tells the owner to tap it, which relaunches the app and clears the force-quit flag. Make that push mutable so a Notification Service Extension can try a last-minute sync.
3. **Fitatu** through HealthKit nutrition data.
4. **Duolingo** through a server-side poll of the unofficial streak endpoint. Check it first with a curl from the MacBook.
5. **Screen Time DeviceActivity** only as an optional phase-3 experiment.
   - Sign it with the development entitlement and install from Xcode.
   - Use thresholds of at least 5 minutes, written to an App Group outbox plus a blocking POST of at most 3 seconds.
   - Send to an idempotent `auto_entry` RPC.
   - File the Family Controls distribution request on day 1 in case TestFlight is wanted later.

Do not use the Supabase session for any background or extension write.

## Effort

8-12 person-days for automatic checking:
- HealthKit sync engine with background delivery, backfill and diagnostics: 4-5
- Server migration and TypeScript metric updates: 1.5-2
- Sleep, dietary energy, timer writing to Health, and the Notification Service Extension fallback: 1.5
- Duolingo poller: 0.5-1
- Optional Screen Time experiment: 2-3

Background delivery also needs about a week of real-device soak testing, which runs in parallel with other work.

## Details

## 0. Verified platform baseline (as of 2026-10-25)
- **iOS 27 / Xcode 27** shipped on 14–15 Sep 2026. Xcode 27 bundles Swift 6.4 and requires macOS Tahoe 26.6 or later. iOS 26.7 continues as a security line. For a personal app on one iPhone, target iOS 27 only.
- **supabase-swift v2.50.0** (2026-07-06) is the newest release I found. It requires Swift 6.1+ and iOS 16+. I recommend it for the foreground UI only (see section 5).
- **HealthKit background delivery** needs the HealthKit capability with the nested "Background Delivery" option, which adds `com.apple.developer.healthkit.background-delivery`. Without it, enableBackgroundDelivery fails with errorAuthorizationDenied. No UIBackgroundModes entry is needed for HealthKit itself. BGAppRefreshTask needs "Background fetch" and `BGTaskSchedulerPermittedIdentifiers`. Silent push needs "Remote notifications".
- **Purpose strings:** NSHealthShareUsageDescription for reading. Add NSHealthUpdateUsageDescription if the Nawyki timer will write mindful sessions.

## 1. Habit to HealthKit mapping

| Habit | HealthKit type | How to aggregate per day | Server metric | Needs |
|---|---|---|---|---|
| Spacer | `HKQuantityType(.stepCount)` | `HKStatisticsQueryDescriptor`, `.cumulativeSum`, unit `.count()`. Merges iPhone and Watch by Health source priority, so it matches the Health app. | `steps` (exists), source_min 7000 | iPhone alone is enough |
| Ruch | `HKQuantityType(.appleExerciseTime)` | cumulativeSum in `.minute()` | `exercise_min` (exists), 30 | Apple Watch. Exercise minutes from an iPhone alone are unreliable or absent. Without a Watch, fall back to the sum of workout durations or `active_kcal`. |
| Medytacja | `HKCategoryType(.mindfulSession)` | Sample query over the day window. Merge overlapping intervals (Watch Mindfulness and a third-party app may log the same session), clip to the window, then sum the minutes. | `mindful_min` (exists), 5 | A meditation app that writes to Health. The Nawyki timer should also write an `HKCategorySample(.mindfulSession)` when it ends. |
| Basen | `HKWorkoutType.workoutType()` + `HKQuery.predicateForWorkouts(with: .swimming)` (iOS 16+: also `predicateForWorkoutActivities` for multi-sport workouts) | Count swimming workouts that start in the window and last at least 10 min. Optionally record distance (`.distanceSwimming`). | **new `swims`**. The existing `workouts` counts every workout type and would wrongly check Basen after a run. | Watch (or Garmin etc. writing to Health) |
| Sen przed 23:00 (bonus) | `HKCategoryType(.sleepAnalysis)`, values `HKCategoryValueSleepAnalysis.allAsleepValues`, falling back to `.inBed` | Night of D = samples starting in [D 18:00, D+1 14:00). Value = max(0, minutes from the first asleep start to D+1 00:00). "Before 23:00" then means value >= 60, which fits the server's `>= source_min` rule. Data arrives the next morning, in time for the 09:00 review. | **new `sleep_early_min`** | Watch sleep tracking (or a third-party sleep app) |
| Fitatu habit (new) | `HKQuantityType(.dietaryEnergyConsumed)`, optionally `HKQuery.predicateForObjects(from: fitatuSource)` (find the source with HKSourceQuery on the device) | cumulativeSum in kcal | **new `dietary_kcal`**, e.g. >= 800 | Fitatu writes meals to Apple Health (per its help centre). Check on the device under Health → Sources → Fitatu. |
| Czytanie, 2 quit habits | none | — | — | Manual (widget or notification action) |

HealthKit never reveals whether read access was denied: queries just return nothing. So **send a metric only when the statistics or samples actually exist** (`sumQuantity() != nil`, or at least one sample). Otherwise health_daily fills up with false zeros.

## 2. Background delivery: real rules
- `enableBackgroundDelivery(for:frequency:)` sets a ceiling, not a schedule: "The system wakes your app from the background at most once per time period". "On iOS, stepCount samples have an hourly maximum frequency." Ask for `.immediate` on every type; the system enforces the caps on its own.
- Apple DTS (Apr 2026): "the delivery frequency is not guaranteed … there is no API to change the behavior". It depends on the app's background budget, battery level, and how many apps compete for background time.
- **Locked device:** "HealthKit data is not available while the device is locked … your app will not be launched for new data until the device unlocks." Writes still work while locked.
- **Force-quit:** iOS "sets a flag that prevents the app from being launched in the background. That flag gets cleared when the user next launches the app manually" (DTS, Oct 2025). The owner must be told never to swipe Nawyki away.
- **Inactivity:** "delivery will stop after 1-2 weeks of 'inactivity'" (DTS, 2024, informal). This matches the owner's 9-day silence, so the server must detect it (section 7).
- If the observer's completion handler is not called, HealthKit retries with backoff. After 3 failures it stops sending background updates.
- Set up observers in `didFinishLaunchingWithOptions` (with `@UIApplicationDelegateAdaptor` in a SwiftUI app) so they exist before HealthKit delivers.
- **Realistic latency:**
  - Spacer: 0–2 h after crossing 7000 steps.
  - Basen and Medytacja: minutes after the Watch syncs.
  - Ruch: roughly hourly.
  - Sleep: the next morning.
  - Worst case: the next app open, push tap or Notification Service Extension run.

## 3. What the app can do when woken
- The whole app process runs (it is not an extension), so the network is allowed. The time window is undocumented: assume about 30 s, design for under 10 s, and wrap the work in `UIApplication.beginBackgroundTask`.
- Use a plain URLSession with a 10 s timeout. The payload is tiny, so a background URLSession is not needed.
- **No outbox for health data:** totals are recomputed from HealthKit and can be resent safely, because the server keeps the larger value (`greatest()` and `do nothing`). Keep `lastSuccessfulSyncDate` in an App Group. On the next wake, recompute from min(today−2, lastSuccess) to today. HealthKit is the queue.
- Handle `errorDatabaseInaccessible`: the user may lock the phone in the middle of a sync. Still call the completion handler and retry on the next wake.

## 4. SyncEngine design

```
Wake sources ──► SyncEngine (actor, coalesces concurrent wakes, one sync in flight)
  HKObserverQuery x6 (didFinishLaunching)
  BGAppRefreshTask (earliestBegin ~07:30, extra chance to finish "yesterday" before the 09:00 push)
  scenePhase .active (30-day backfill)
  notification action "Zrobione" / widget AppIntent (opportunistic)
  Notification Service Extension on the 09:00 push (best effort, section 7)
        │
        ├─ profile cache (timezone, day_start_hour) in App Group, refreshed on foreground
        ├─ for each day D in window: DayWindow(D) → queries → {steps, exercise_min, mindful_min, swims, sleep_early_min, dietary_kcal, workouts, distance_km, active_kcal}
        ├─ POST {SUPABASE_URL}/rest/v1/rpc/ingest_metrics  {p_token, p_metrics, p_date: D}
        ├─ on newly_checked → local notification ("Spacer odhaczony: 8 234 kroków") + WidgetCenter.reloadAllTimelines()
        └─ append to sync log (App Group) → "Diagnostyka" screen: last wake reason/time/result
```

Day window. Use exact per-day queries. Avoid one `HKStatisticsCollectionQuery`, because it buckets days with the device's calendar, which goes wrong when travelling and when day_start_hour > 0. Use `bySettingHour` rather than adding hours, because 2026-10-25 is itself the day DST ends (a 25-hour day):

```swift
func window(_ d: DateComponents, tz: TimeZone, startHour: Int) -> DateInterval {
  var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
  let day = cal.date(from: d)!
  let start = cal.date(bySettingHour: startHour, minute: 0, second: 0, of: day)!
  let next = cal.date(byAdding: .day, value: 1, to: day)!
  let end = cal.date(bySettingHour: startHour, minute: 0, second: 0, of: next)!
  return DateInterval(start: start, end: end)
}
```

Observer registration (load-bearing part):

```swift
for type in syncTypes {
  store.execute(HKObserverQuery(sampleType: type, predicate: nil) { _, done, _ in
    Task { await SyncEngine.shared.sync(.healthKit); done() }   // always call done()
  })
  try await store.enableBackgroundDelivery(for: type, frequency: .immediate)
}
```

**Always send an explicit `p_date`.** The latest `ingest_metrics` (in `supabase/migrations/20261025090000_audit_fixes.sql`) has a Shortcut heuristic: without `p_date`, a call made before 00:15 is filed under yesterday. A background wake at 00:05 would otherwise send today's partial totals to yesterday.

## 5. Write path decision
- **Recommended: call the RPC directly with the API token.** `POST https://<ref>.supabase.co/rest/v1/rpc/ingest_metrics` with header `apikey: <publishable key>` and body `{p_token, p_metrics, p_date}`.
  - The RPC already checks the token hash, type-checks and range-checks the values, writes health_daily and checks the habits.
  - Going direct skips a Vercel function cold start inside a background window of a few seconds, and it keeps working when a Vercel deploy is broken.
  - `/api/ingest` only adds Polish number parsing (`"8 234"`) that Shortcuts need. Keep it for the PWA and Shortcut path; the native app does not need it.
- **Why not a supabase-swift session in background:** refresh tokens rotate, and up to 4 processes (app, widget, Notification Service Extension, DeviceActivity extension) would refresh at the same time. That risks "refresh token already used" and a silent logout, after which every automatic check stops. The `ht_` token never expires and needs no refresh. Store it in a Keychain item shared with the extensions (`keychain-access-groups`), using `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` so that extensions running while the phone is locked can read it.
- **Token provisioning:** after the user signs in on the foreground session, call `new_api_token()` once and store the result. Today `api_tokens` has `user_id` as its primary key (`20261023120000_health_ingest.sql`), so this rotates the key and breaks any existing Shortcut token. Hence the multi-token change below.
- **Use supabase-swift (v2.50) only for the foreground UI.**

## 6. Server changes (one migration plus TS)
1. **New metrics** `swims`, `sleep_early_min`, `dietary_kcal`. They must be added in four places that have to stay in sync:
   - the `health_daily.metric` check
   - the `habits.source` check
   - the metric array in `ingest_metrics`
   - `HEALTH_METRICS` / `METRIC_INFO` in `lib/domain/health.ts` (which the edge function also bundles)

   Better: replace the check constraints with a `health_metrics(key)` lookup table and a foreign key.
2. **Yes/no habits: Health data overrides "nie dziś".** Change the conflict clause to:
   ```sql
   on conflict (habit_id, entry_date) do update set value = 1
     where public.habit_entries.value = 0 and not public.habit_entries.skipped
   ```
   Today it is `do nothing`. If the morning review gets a "nie dziś" answer before the Watch finishes syncing, the 0 stays even though 9000 steps arrive later. A deliberate skip (`skipped`) stays untouched.
3. **Return `newly_checked`** (via ROW_COUNT / RETURNING) so the app sends a local notification only when the state actually changes.
4. **Add `habit_entries.origin`** ('manual' | 'health' | 'screen_time' | 'duolingo' | 'widget' | 'notification') and switch `manualDates()` in `lib/domain/nudges.ts` to use it. Today it treats every entry of a habit with `source` as automatic, so a manual widget tap on Spacer would not count as "the owner was here". Screen Time or Duolingo habits without a `source` would make automatic entries count as presence, which would distort the absence and comeback logic.
5. **Multiple tokens:** give `api_tokens` an `id` primary key plus `label` / `device`. Each token updates its own `last_used_at`.
6. **Optional `ingest_days(p_token, p_days jsonb)`** that loops over a shared internal function, giving one round trip per wake instead of 3 (or 30 on backfill). Phase 1 can simply call `ingest_metrics` three times.
7. **`auto_entry(p_token, p_habit uuid, p_date, p_value, p_origin)`** for Screen Time and Duolingo. It must be safe to repeat (keep the larger value). Do **not** reuse `log_habit`: for count and duration habits it adds the value each time, so a Screen Time event that fires twice would count twice.
8. **Staleness check in send-reminders:** if the user has habits with a `source` and the iOS token's `last_used_at` is more than 30 hours old, the 09:00 "yesterday" push gets a variant: "Zdrowie nie zsynchronizowane — stuknij". Tapping launches the app, which clears the force-quit flag and runs the foreground sync.

The PWA needs no change beyond labels and the source picker for the new metrics. Automatic entries appear in it through the same tables.

## 7. When background delivery is dead
Possible causes: force-quit, 1–2 weeks of inactivity, Low Power Mode, or a phone left locked.
- **Server side:** the staleness push above (Apple DTS's own suggestion).
- **Notification Service Extension:** send the 09:00 push over APNs with `mutable-content: 1`. The extension runs whether or not the push is tapped (about 30 s, small memory budget). If the phone is unlocked, it reads yesterday's totals from HealthKit, calls `ingest_metrics`, and rewrites the body to list only the habits still open. DTS says this "may or may not necessarily be enough", so it is best effort only: HealthKit is unreadable while the phone is locked.
- **Silent pushes** (`content-available`): at most 2–3 per hour, never delivered to a force-quit app, and possibly not delivered to an app that hasn't been opened for a while. Use them at most once a day (for example 08:40). They are not a guarantee.
- **App side:** a 30-day backfill on every foreground launch. `ingest_metrics` accepts dates up to 30 days back, so after a silence like the 9-day one, Spacer, Ruch, Medytacja and Basen fill in by themselves the moment the app is opened.
- **Tell the owner once, in onboarding:** "Nie zamykaj Nawyków przesunięciem w górę."

## 8. Detecting use of other apps without Shortcuts: Screen Time API
**Entitlement**
- Family Controls (Development) is available to paid Apple Developer Program members ("you can access the entitlement through the Apple Developer Program during development"). It does not work for free Personal Teams.
- An Xcode-installed, development-signed build on the owner's iPhone works without Apple approval. The development profile is valid for 1 year, then the app must be rebuilt and reinstalled.
- TestFlight and App Store distribution need the distribution entitlement, requested via developer.apple.com/contact/request/family-controls-distribution, **separately for the app and for each extension** (separate bundle IDs). Waits range from under an hour to more than a month. If the app normally reaches the iPhone through TestFlight, either keep the Screen Time targets in a separate Xcode-only scheme or file the request on day 1.

**Authorization:** `AuthorizationCenter.shared.requestAuthorization(for: .individual)` shows a Face ID / passcode prompt. The owner picks Duolingo in `FamilyActivityPicker`. Tokens are opaque: the app never sees "Duolingo", but `Label(token)` displays its name and icon. Store the token to habit mapping (Codable) in the App Group.

**Monitor setup**
- `DeviceActivityCenter().startMonitoring(.daily, during: DeviceActivitySchedule(intervalStart: 00:00, intervalEnd: 23:59, repeats: true), events:)` with events per habit at 5, 10, 15 and 20 min, named `"<habitUUID>|<min>"`.
- `includesPastActivity: true` (iOS 17.4+) so that restarting the monitor mid-day still counts usage from earlier that day.
- Schedule interval: at least 15 min and at most 1 week (`intervalTooShort` / `intervalTooLong`; the bounds come from community reports).
- Avoid schedules that cross midnight: there are reports of thresholds not firing. With day_start_hour > 0, accept calendar days.
- Thresholds are `DateComponents` with minute precision. A 1-minute threshold has been reported to fire immediately at interval start, so use 5 minutes or more.

**Extension limits**
- 6 MB memory: no Supabase SDK, only Foundation and plain URLSession.
- Apple: "lifecycle ends as soon as the synchronous methods you override return". Apple's own workaround is `DispatchGroup.wait(timeout: 3.0)` around the request. The reporter still couldn't read the response.
- The standard pattern: in `eventDidReachThreshold`, (1) append `{habitId, date, minutes}` to an App Group outbox (small JSON or `UserDefaults(suiteName:)`), (2) try a blocking POST of at most 3 s to `rpc/auto_entry`, (3) post a local notification. The main app empties the outbox on any wake; the hourly HealthKit wakes give it frequent chances.

**Reliability (developer reports, no Apple fixes)**
- Threshold fires twice, and fires without the threshold being reached (iOS 18.5).
- Fires early because Safari time is overcounted (17.6.1).
- Inconsistent or missing events (iOS 17).
- intervalDidStart never called (iOS 26.3.1).
- Monitor extension killed after a few days; authorisation revoked on its own.
- Extension killed by memory pressure even when written carefully.
- A third-party blog (unverified) says iOS 27 left DeviceActivity throttling and dropped callbacks unchanged.

**Verdict:** technically feasible for a personal build, with medium-to-low reliability. "5 minutes in Duolingo" is also only a stand-in for "did a lesson". Build it last, as an experiment, and only for apps that have no better signal.

## 9. Alternatives
- **Duolingo, unofficial API (preferred):** `GET https://www.duolingo.com/2017-06-30/users?username=<nick>&fields=streak,streakData{currentStreak,previousStreak}`.
  - A lesson today extends the current streak (check `currentStreak.endDate` / `lastExtendedDate`; verify the field names with a curl from the Mac).
  - Poll it from Supabase hourly (pg_cron + edge function, service role) and call `auto_entry` with origin 'duolingo'.
  - No device, entitlement or extension involved.
  - Risks: unsupported, "can change without notice", the profile must be readable. I could not test it live from this sandbox, because the proxy blocked it.
- **Duolingo + Apple Health:** I found no sign that Duolingo writes to Health.
- **Fitatu:** no public API. HealthKit nutrition data is the right signal (see section 1).
- **Shortcuts "App opened" automation:** the only other iOS route for detecting app use. Excluded because the owner refuses Shortcuts.

## 10. Feasibility verdict per idea
- **Spacer ← steps:** GO, high confidence. Works with the iPhone alone; checked within about 1–2 hours.
- **Ruch ← exercise minutes:** GO if the owner has an Apple Watch. Otherwise use workout minutes.
- **Medytacja ← mindful minutes:** GO, provided the meditation source writes to Health. Make the Nawyki timer write to Health too.
- **Basen ← swimming workouts:** GO. Needs the new `swims` metric and a Watch.
- **Sen przed 23:00 ← sleep analysis:** GO as a bonus, needs the Watch.
- **Czytanie:** NO automatic route. Use the widget or notification action.
- **Fitatu ← nutrition data in Health:** GO (likely); confirm on the device first.
- **Duolingo ← unofficial streak API:** GO, try first. Cheap and accurate, but fragile.
- **Any app ← Screen Time DeviceActivity:** FEASIBLE, LOW reliability. Phase 3, development-signed.
- **Fitatu or Duolingo official APIs:** NO, they don't exist.

## 11. Phasing
1. **Server migration (section 6, items 1–5 and 8).** It works for the PWA immediately, and the edge function picks up the new `lib/domain` code.
2. **HealthKit sync for steps, exercise minutes, mindful minutes and swims:**
   - observers, BGAppRefresh, foreground backfill
   - a diagnostics screen showing the sync log
   - a week of untethered testing on the iPhone (the Simulator can't do background delivery, and an attached debugger hides throttling)
3. **Sleep, dietary energy, the timer writing mindful sessions,** and the Notification Service Extension on the 09:00 push.
4. **Duolingo poller.**
5. **Screen Time experiment.**

## 12. Gotchas checklist
- Always call the observer's completion handler.
- Coalesce wakes that arrive together.
- Never send metrics that have no data.
- Always send an explicit `p_date`.
- Calculate days in the profile's timezone, not the device's.
- Remember DST days (25 or 23 hours).
- Use a Keychain accessibility class that lets extensions read the token while the phone is locked.
- Don't rotate the single API token from the app.
- Treat "nie dziś" vs Health data as a product decision.
- Keep origin tracking right so the absence and comeback logic stays honest.
- Keep the metric lists in sync across SQL and TypeScript.
- Teach the owner not to force-quit.

## Risks

- HealthKit background delivery stops silently after a force-quit, and after about 1-2 weeks without using the app (Apple DTS, informal). The owner already had a 9-day silence. Mitigation: a server staleness push, a Notification Service Extension fallback on the 09:00 push, and a 30-day backfill on every foreground launch.
- HealthKit cannot be read while the phone is locked, and iOS does not wake the app until it is unlocked. Syncs and the Notification Service Extension fallback work only when the phone is unlocked, so late-evening totals may land only the next morning.
- Delivery frequency is best-effort: steps are capped at once per hour, and other wakes can be delayed or skipped because of battery level, Low Power Mode or competing apps. Spacer may be checked up to about 2 hours after the threshold is reached, or only on the next app open.
- Exercise minutes, swimming workouts, sleep and Watch mindfulness all depend on an Apple Watch (or another tracker writing to Health). If the owner has no Watch, only Spacer is truly automatic.
- Omitting p_date triggers the server's Shortcut rule that files calls made before 00:15 under yesterday, so a background sync at 00:05 would put today's partial totals on yesterday.
- The current 'workouts' metric counts every workout type, so mapping Basen to it would check Basen after a run. A new 'swims' metric is required.
- For yes/no habits, ingest_metrics currently does nothing on conflict, so a 'nie dziś' 0 answered before the Watch syncs blocks the automatic check permanently.
- manualDates() treats every entry of a habit with a source as automatic. Manual widget or notification taps on those habits would be ignored for presence, and automatic entries for Screen Time or Duolingo habits (which have no source) would count as presence. This distorts the absence and comeback logic until an entry origin column is added.
- Only one API token per user exists today. Generating a token in the iOS app rotates it and breaks any existing Shortcut, and the server cannot see sync staleness per device.
- Screen Time (DeviceActivity) has documented-by-developers reliability problems: double, early, missing and spurious threshold events; the monitor extension killed after a few days; authorisation revoked on its own. It also has 6 MB of memory and no async work (network only via a blocking wait of about 3 s), and is reportedly unchanged in iOS 27.
- The Family Controls distribution entitlement (needed for TestFlight and Ad Hoc builds) must be approved separately for the app and for each extension, with waits from hours to more than a month. A development-signed Xcode install avoids this but has to be re-signed yearly.
- The unofficial Duolingo endpoint is unsupported and could start requiring auth or change its fields at any time. It could not be verified live from this sandbox.
- Fitatu's Apple Health export is confirmed only by its help centre. The exact data types and how often it writes them must be checked on the device.
- Background behaviour cannot be tested in the Simulator, and an attached debugger disables push throttling, so tests run from Xcode overstate how reliable it is.

## Open questions

- Does the owner wear an Apple Watch daily, including at night and in the pool? If not, does another tracker (Garmin, Polar) write workouts and sleep to Apple Health? Without one, only Spacer is fully automatic.
- What does the owner use to meditate (Watch Mindfulness, Headspace or Medito, the Nawyki timer, or nothing)? This decides whether Medytacja can be automatic and whether the Nawyki timer must write mindful sessions to Health.
- What is profiles.day_start_hour for the owner (0 or e.g. 3)? Anything other than 0 makes day totals differ from what the Health app shows, and complicates Screen Time schedules.
- Should data from Health override a manual 'nie dziś' (0) answer for yes/no habits? Recommended yes; a deliberate skip would stay untouched.
- Which new habits would Duolingo and Fitatu feed? 'Lesson done' and 'meals logged (kcal >= X)' are recommended over 'app opened for N minutes'. What is the Duolingo username, and is the profile public?
- How will the app be installed: directly from Xcode (development signing, yearly re-sign, no Family Controls approval) or via TestFlight (needs Family Controls distribution approval for the app and each extension if Screen Time is included)?
- Thresholds: Spacer at 7000 steps or by distance; Basen minimum workout length (10 min?); 'Sen przed 23:00' measured from falling asleep or from getting into bed, and with how much tolerance?
- What are the two quit habits? If one is about an app (e.g. social media), Screen Time could flag breaches, at the cost of false positives.
- Is it acceptable that a Notification Service Extension rewrites the 09:00 push text (e.g. listing only the habits still open after a last-minute sync)? This requires moving that push from Web Push to APNs.

## Sources

- https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)
- https://developer.apple.com/forums/thread/823699
- https://developer.apple.com/forums/thread/761045
- https://developer.apple.com/forums/thread/694223
- https://developer.apple.com/documentation/healthkit/hkerror/code/errordatabaseinaccessible
- https://developer.apple.com/forums/thread/803365
- https://developer.apple.com/documentation/xcode/configuring-healthkit-access
- https://developer.apple.com/forums/thread/708199
- https://developer.apple.com/documentation/healthkit/executing-statistics-collection-queries
- https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app
- https://developer.apple.com/forums/thread/760244
- https://developer.apple.com/documentation/xcode/configuring-family-controls
- https://developer.apple.com/documentation/familycontrols
- https://developer.apple.com/forums/thread/852204
- https://developer.apple.com/forums/thread/796550
- https://developer.apple.com/forums/thread/824726
- https://developer.apple.com/forums/thread/701874
- https://developer.apple.com/forums/thread/724649
- https://developer.apple.com/forums/thread/726666
- https://developer.apple.com/forums/thread/827783
- https://developer.apple.com/forums/thread/786854
- https://developer.apple.com/forums/thread/763542
- https://developer.apple.com/forums/thread/737741
- https://developer.apple.com/forums/thread/749006
- https://developer.apple.com/forums/thread/747557
- https://developer.apple.com/forums/thread/762137
- https://developer.apple.com/forums/thread/819224
- https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/monitoringerror
- https://developer.apple.com/documentation/deviceactivity/deviceactivityevent/init(applications:categories:webdomains:threshold:includespastactivity:)
- https://habitdoom.com/blog/wwdc-2026-screen-time-wishlist
- https://www.mactech.com/2026/09/10/app-store-submissions-now-open-for-the-latest-os-releases/
- https://mjtsai.com/blog/2026/09/15/xcode-27/
- https://dev.classmethod.jp/en/articles/ios-dev-weekly-changes-20260918/
- https://newreleases.io/project/github/supabase/supabase-swift/release/v2.50.0
- https://leanrada.com/notes/get-duolingo-streak/
- https://glama.ai/mcp/servers/gajrccg57l
- https://www.fitatu.com/pl/help/czy-jest-mozliwa-synchronizacja-fitatu-z-innymi-urzadzeniami-i-aplikacjami
- https://forum.freeletics.com/t/iphone-fitness-app-what-rings-are-supported/14382
- Repo: /home/user/habit-tracker/supabase/migrations/20261024120000_health_daily.sql
- Repo: /home/user/habit-tracker/supabase/migrations/20261025090000_audit_fixes.sql (latest ingest_metrics, 00:15 rule)
- Repo: /home/user/habit-tracker/supabase/migrations/20261023120000_health_ingest.sql (api_tokens, user_id PK)
- Repo: /home/user/habit-tracker/app/api/ingest/route.ts
- Repo: /home/user/habit-tracker/lib/server/shortcut.ts
- Repo: /home/user/habit-tracker/lib/domain/health.ts
- Repo: /home/user/habit-tracker/lib/domain/nudges.ts (manualDates)
