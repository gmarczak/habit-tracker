# Nawyki na iOS: plan natywnej aplikacji (wersja po przeglądzie)

Stan na 2026-10-25: iOS 27 wyszedł 14.09.2026, iOS 27.1 w październiku, Xcode 27 (Swift 6.4). Dokument jest dla ownera i dla sesji AI, które wdrażają go w tym repo etap po etapie. Każdy etap da się zrobić w osobnej sesji. Kod Swift żyje w `ios/`, backend w istniejących katalogach (`supabase/`, `app/`, `lib/`, `features/`).

---

## 1. Cel i zasady

**Co budujemy.** Prywatną aplikację iOS „Nawyki”, instalowaną z Xcode na jednym iPhonie (bez App Store i bez TestFlight), która:
- **odhacza nawyki automatycznie** z Apple Zdrowie w tle, bez Skrótów: Spacer, Ruch, Medytacja, Basen, a w bonusie Sen przed 23:00. Dane mogą pochodzić z iPhone'a, Apple Watcha albo Garmin Connect (repo wskazuje na Garmina, patrz §6 i §8);
- ma **„Zrobione” / „Nie dziś” w powiadomieniach**, więc push „wczoraj” o 09:00 da się załatwić bez otwierania aplikacji;
- ma **interaktywny widżet** oraz Controls (Centrum sterowania, ekran blokady, przycisk czynności). Przycisk czynności przypisuje się bezpośrednio do Controla, więc Skróty nie są potrzebne;
- później wykrywa Duolingo i Fitatu, a na końcu powstaje eksperyment ze Screen Time.

**Zasady, które się nie zmieniają:**
1. **PWA działa cały czas**, także po przejściu na aplikację. Migracje są addytywne, a jedyny wyjątek (M6) wymaga osobnej decyzji ownera. Zmiany w webie działają tylko za flagą `isNativeShell`. Wyjątkiem jest sekcja „Urządzenia”, która jest widoczna także w PWA.
2. **Jedno źródło prawdy to Supabase.** Telefon trzyma tylko cache (`snapshot.json`) i kolejkę operacji (outbox).
3. **Logika domeny zostaje w TypeScript** (`lib/domain`): serie, „nie odpuść dwa razy”, plany tygodniowe, `day_start_hour`, nieobecność i powrót. Swift tylko wyświetla wynik z serwera i robi proste optymistyczne przełączenia.
4. **Ekrany to na start ta sama strona w WKWebView.** Poprawki UI dalej idą przez Vercel, bez ponownej instalacji aplikacji.
5. **Projekt Xcode generuje XcodeGen** (`ios/project.yml`; `.xcodeproj` w `.gitignore`). Jeśli XcodeGen nie obsłuży Xcode 27, zapasowo commitujemy `.xcodeproj` z folderami synchronizowanymi (Xcode 16+). Wtedy plik projektu prawie się nie zmienia.
6. **Każdy etap ma wyłącznik i drogę odwrotu:**
   - „Odwołaj urządzenie” w PWA natychmiast blokuje wszystkie natywne zapisy;
   - `profiles.push_target = 'web'` przywraca Web Push;
   - każda migracja ma plik `supabase/rollback/<nazwa>.down.sql`, poza folderem migracji, więc CI go nie uruchamia.
7. **Sekret urządzenia nigdy nie trafia do JavaScriptu** ani do odpowiedzi serwera.

## 2. Decyzja architektury

**Wybór: natywna aplikacja SwiftUI, której główny ekran to `WKWebView` z https://nawyki.gmarczak.xyz, plus natywne rozszerzenia. Bez Capacitora i bez supabase-swift.**

Dlaczego tak: wszystko, czego owner naprawdę chce, to kod Swift w rozszerzeniach albo w aplikacji wybudzonej w tle, czyli tam, gdzie web view nie istnieje. Dotyczy to widżetu, akcji w powiadomieniach, HealthKit w tle, Controls, App Shortcuts i Screen Time. Kontener decyduje więc tylko o tym, kto rysuje ekrany. Te ekrany już istnieją i zmieniają się prawie codziennie (PR #14–#28 w dwa tygodnie). Dane web pobiera po stronie klienta (`lib/data/snapshot.ts` → `supabaseBrowser()`), więc w WKWebView działa tak jak w Safari.

Odrzucone:
- **Capacitor z `server.url`.** Komentarz w samej konfiguracji mówi, że opcja służy do live-reload i „not intended for use in production”. Oszczędza około 0 dni, bo natywne funkcje i tak piszemy w Swift. Do tego co roku dochodzi aktualizacja frameworka: dziś Capacitor 8.5, a Capacitor 9 jest zapowiedziany na koniec listopada 2026.
- **Capacitor ze statycznym eksportem.** Static export w Next 16 nie obsługuje `proxy.ts`, route handlerów zależnych od Request, dynamicznych tras bez `generateStaticParams` (`habits/[id]`) ani domyślnego loadera `next/image` (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`). Każda zmiana UI wymagałaby ponownej instalacji.
- **Pełny SwiftUI.** 40–50 dni pracy, a potem na zawsze dwa interfejsy i dwie kopie logiki.
- **Wspólna sesja Supabase w Keychain dla aplikacji i rozszerzeń** (np. `KeychainLocalStorage` z access group). Refresh token jest rotowany. Ponowne użycie poza krótkim oknem (konfigurowalnym, zwykle 10 s) powoduje, że Supabase unieważnia całą sesję. Kilka procesów odświeżających ten sam token to dokładnie ten wyścig.
- **Natywny ekran „Dziś” od razu.** Dopiero w Etapie 8, i tylko jeśli po 3–4 tygodniach widżet, powiadomienia i HealthKit nie wystarczą.

## 3. Architektura

### 3.1 Komponenty

Cel wdrożenia (deployment target): **iOS 26.0**. Telefon ownera ma iOS 26 albo 27, a dzięki temu nie piszemy kodu zgodności wstecz (push do widżetów wymaga iOS 26).

| Target | Bundle ID | Rola |
|---|---|---|
| Nawyki (aplikacja) | `xyz.gmarczak.nawyki` | **`WebContainer`:** WKWebView i most JS↔Swift.<br>**`AppDelegate`:** APNs, kategorie i akcje powiadomień, obserwatory HealthKit, `BGAppRefreshTask`, wysyłka outboxu przy każdym wybudzeniu, natywny arkusz „Diagnostyka” |
| NawykiWidgets (appex) | `xyz.gmarczak.nawyki.widgets` | Widżety ekranu głównego i ekranu blokady, Controls, App Intents. Intencje widżetów i Controls domyślnie działają w procesie rozszerzenia. |
| NawykiNotificationContent (appex) | `xyz.gmarczak.nawyki.notification-content` | Rozwinięte powiadomienie `MULTI` z listą nawyków do odhaczenia (`UNNotificationExtensionCategory = MULTI`, `UNNotificationExtensionUserInteractionEnabled = YES`) |
| NawykiActivityMonitor (appex, Etap 7) | `xyz.gmarczak.nawyki.activity-monitor` | DeviceActivity: progi czasu w aplikacjach trafiają do outboxu |
| NawykiKit (lokalny pakiet SPM) | – | `APIClient` (URLSession), `Outbox`, `SnapshotStore`, `Credentials`, `HabitEntity`/`HabitQuery`, intencje, `DayWindow`, `SyncLog` |

**App Group `group.xyz.gmarczak.nawyki`** zawiera:
- `snapshot.json`;
- `outbox/<op_id>.json`, jeden plik na operację, zapisywany atomowo, żeby procesy nie pisały do tego samego pliku;
- `sync-log.jsonl`.

Pliki mają ochronę `.completeUntilFirstUserAuthentication`, ustawioną jawnie, bo akcje powiadomień i Controls działają przy zablokowanym telefonie. W App Group nie trzymamy SQLite: blokada pliku trzymana podczas zawieszenia procesu kończy się jego ubiciem (0xdead10cc).

**Keychain access group `$(AppIdentifierPrefix)xyz.gmarczak.nawyki.shared`** przechowuje `device_id` i sekret urządzenia z `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (bez backupu i bez iCloud). Grupa jest wpisana w entitlements **wszystkich** targetów.

**Keychain przeżywa odinstalowanie aplikacji.** Przy pierwszym starcie, gdy w `UserDefaults` App Group nie ma flagi `installed`, aplikacja najpierw czyści swoje wpisy w Keychain, a dopiero potem ustawia flagę.

### 3.2 Uwierzytelnianie

| Kto | Czym |
|---|---|
| WKWebView | Własna sesja cookie Supabase: logowanie hasłem, odświeżanie przez `proxy.ts`, dokładnie jak w PWA |
| Cały kod natywny: aplikacja w tle, widżet, intencje, Controls, rozszerzenia | **Sekret urządzenia** `nwk_` + 64 znaki hex (256 bitów z `SecRandomCopyBytes`). W bazie leży tylko SHA-256. Sekret nie wygasa i można go odwołać w PWA. |

**Co pozwala sekret:**
- czytać nawyki, plany, wpisy (bez notatek), pauzy i daty nastrojów;
- zapisywać wpisy do 30 dni wstecz, dane zdrowia i tokeny push.

Sekret nie pozwala usuwać nawyków ani zmieniać ustawień czy konta.

**Przydział sekretu.** Sekret generuje telefon, a web rejestruje tylko jego hash:
1. Przy pierwszym starcie (po wyczyszczeniu Keychain, §3.1) aplikacja losuje `device_id` (UUID) i sekret, a potem zapisuje oba w Keychain.
2. `WKUserScript` (na `atDocumentStart`, tylko w głównej ramce) wstrzykuje `window.__nawykiNative = { deviceId, secretHash, registered, build, apnsEnv }`. Strona dostaje wyłącznie SHA-256 sekretu. UA rozszerzamy przez `applicationNameForUserAgent = "NawykiiOS/1"`, czyli dopisek, a nie podmianę, żeby `isIos()` w `features/reminders/push.ts` dalej działało.
3. Po zalogowaniu web (gdy `isNativeShell && !registered`) woła sesją cookie `register_device(p_device_id, p_secret_hash, p_name, p_bundle_id, p_app_version, p_os_version)`, a potem `postNative('registered')`.
4. Aplikacja potwierdza rejestrację: `GET /api/v1/snapshot` z `Bearer nwk_…` zwraca 200. Wtedy zapisuje `registered = true`.
5. Most przyjmuje wiadomości tylko z `frameInfo.isMainFrame` i z hosta `nawyki.gmarczak.xyz` (oraz `beta.nawyki.gmarczak.xyz` w buildzie Debug).
6. **Wylogowanie** w `features/settings/sections.tsx` (już używa `signOut({ scope: 'local' })`, bo projekt Supabase dzielą inne aplikacje):
   - kolejność: `revoke_device(deviceId)` → `signOut` → `postNative('signedOut')`;
   - aplikacja wywołuje dodatkowo `device_revoke_self(p_secret)`, na wypadek gdyby web był offline;
   - potem czyści Keychain i App Group, przeładowuje widżety i przy następnym logowaniu losuje nowy sekret.
7. **Kod 28000 z dowolnego RPC `device_*`** (odwołane urządzenie, usunięte konto) oznacza to samo co wylogowanie. Outbox zostaje w diagnostyce, a nie jest wysyłany.

### 3.3 Przepływ danych

```text
iPhone
 Nawyki.app ─ WKWebView ──(cookie JWT, RLS)──────────────► Supabase PostgREST (jak PWA)
     │  web→native: registered / signedOut / dataChanged / badge / requestPush / requestHealth / openDiagnostics
     │  native→web: __nawyki.invalidate(), __nawyki.navigate(url)
     ├─ AppDelegate: akcje powiadomień, HealthKit SyncEngine, BGAppRefresh; każde wybudzenie = flush outboxu
 NawykiWidgets.appex (widżety, Controls, App Intents)
 NawykiNotificationContent.appex
        │ wszystkie: NawykiKit → outbox/*.json → snapshot.json (App Group)
        │
        ├──(p_secret w treści, klucz publishable)──► Supabase RPC: device_apply_entries / device_ingest_health / device_set_push
        └──(Bearer nwk_)──► Vercel fra1  GET /api/v1/snapshot
                                   └► RPC device_snapshot → lib/domain → JSON (wczoraj/dziś/jutro + lista nawyków)

Supabase pg_cron (co 5 min) → send-reminders → Web Push (PWA)  i/lub  APNs (category, habitIds, forDate)
HealthKit ─(wybudzenie obserwatora po odblokowaniu)→ SyncEngine → device_ingest_health → habit_entries(origin='health')
```

**Reguły przepływu:**
- **Zapisy natywne idą prosto do RPC Supabase.** W tle okna czasowe są krótkie, nie ma cold startu Vercela, a zapis działa nawet przy zepsutym deployu. Klucz publishable (`sb_publishable_…`) jest publiczny z założenia, a autoryzacją jest sekret.
- **Obliczony widok dnia przychodzi z Vercela.** Tam działa `lib/domain` z testami vitest.
- **Datę operacji zawsze bierzemy z payloadu serwera** (snapshot albo `forDate` w pushu), nigdy z zegara telefonu. Wyjątek: HealthKit liczy dni według strefy i `day_start_hour` z profilu.
- **Synchronizacja w obie strony.** Po natywnym zapisie aplikacja woła `evaluateJavaScript("window.__nawyki?.invalidate()")`. Web po edycji nawyku wysyła `dataChanged`, a aplikacja pobiera snapshot i przeładowuje widżety.

### 3.4 Szczegóły WebView
- **Magazyn danych.** `WKWebsiteDataStore.default()`, czyli trwały: cookie i IndexedDB z kolejką offline TanStack przeżywają restart.
- **Offline.** `WKAppBoundDomains = [nawyki.gmarczak.xyz]` (w Debug także `beta.nawyki.gmarczak.xyz`; limit to 10 domen) i `limitsNavigationsToAppBoundDomains = true`.
  - WebKit włącza service worker w WKWebView tylko dla domen App-Bound. Apple DTS potwierdza, że service workery w WKWebView działają, ale Web Push nie. Test jest w Etapie 0.
  - Domena Supabase nie musi być na liście, bo `fetch` to nie nawigacja. Dodajemy ją tylko, jeśli test pokaże blokadę.
  - Skutek uboczny: żaden WKWebView w aplikacji nie nawiguje poza listę, więc linki zewnętrzne otwiera `SFSafariViewController`.
  - Jeśli service worker nie ruszy, zostaje natywny ekran „Brak sieci” z przyciskiem „Spróbuj ponownie”.
- **Ustawienia widoku.** `allowsBackForwardNavigationGestures = false`, bo gest kłóci się ze swipe w `SwipeRow`. `contentInsetAdjustmentBehavior = .never`; strona ma już `viewportFit: "cover"` i `env(safe-area-inset-*)`. Tło #f2f2f7 albo czarne, żeby nie było białego błysku.
- **Bez ładowania w tle.** WebView powstaje dopiero przy aktywnej scenie, więc wybudzenie przez HealthKit, BGAppRefresh czy akcję powiadomienia nie ładuje strony.
- **Implementacja.** `UIViewRepresentable` wokół `WKWebView`, a nie SwiftUI `WebView`. Potrzebujemy `WKScriptMessageHandler`, `WKUserScript` i pełnej `WKWebViewConfiguration`.
- **Hasła.** Associated Domains `webcredentials:nawyki.gmarczak.xyz` i plik `public/.well-known/apple-app-site-association`, wykluczony z `matcher` w `proxy.ts`. Bez wykluczenia CDN Apple dostanie przekierowanie do `/login`. Autouzupełnianie hasła z Keychain wtedy działa. Okienko „zapisz hasło” w WKWebView zwykle się nie pojawia, ale owner ma już hasło zapisane z Safari/PWA.
- **Podgląd zmian webu w powłoce.** Stała domena `beta.nawyki.gmarczak.xyz` przypisana do gałęzi preview w Vercel. Ochrona SSO projektu obejmuje tylko domeny inne niż własne (`all_except_custom_domains`), więc własna subdomena działa bez bypassu. Przełącznik bazowego adresu jest tylko w buildzie Debug, w „Diagnostyce”.

## 4. Zmiany w backendzie

**Korekty względem notatek badawczych:**
- **`api_tokens`, `log_habit`, `token_habits` i `ingest_metrics` zostają zamrożone, bez żadnych zmian.** Tabela `api_tokens` ma 0 wierszy, a owner nie używa Skrótów. Wpisy z tych funkcji dostają `origin = NULL`, czyli działa dla nich stara reguła. Mniej refaktoru i mniej ryzyka. Usunięcie to M6.
- **`export const preferredRegion` jest w Next 16 przestarzałe** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md`). Region ustawiamy w `vercel.json` (`"regions": ["fra1"]`), żeby był w repo i w przeglądzie. Nowe projekty Vercel domyślnie działają w iad1, a baza jest w eu-central-1.
- **Metryka basenu to `swim_workouts`**, bez `swim_min`. Obecne `workouts` liczy każdy trening, więc po biegu odhaczyłoby Basen.
- **Klucz APNs trzymamy jako sekret Edge Function.** JWT cache'ujemy w pamięci instancji (izolatu) na 50 minut. **Bez tabeli `apns_jwt_cache`.** Zasada Apple „nie częściej niż co 20 min” dotyczy jednego połączenia. Zimna instancja otwiera nowe połączenie, więc nowy JWT jest wtedy poprawny.
- **Projekt Vercel ma Deployment Protection (SSO) na domenach innych niż własne.** Testy `/api/v1/snapshot` na preview robimy przez `beta.nawyki.gmarczak.xyz` albo z nagłówkiem `x-vercel-protection-bypass`.

### 4.1 Migracje

Wgrywamy je przez Supabase MCP `apply_migration` albo SQL Editor i zapisujemy wersje. **Nigdy `supabase db push`**: historia na produkcji różni się od nazw plików i zawiera migracje innych aplikacji z tego projektu.

**Po każdej migracji:**
- testy w `supabase/tests/assertions.sql` (CI: job `database`, czyli `behavior.sql` i `assertions.sql` na czystym Postgresie 17);
- `npm run db:types`;
- obok migracji plik `supabase/rollback/<nazwa>.down.sql`.

Daty w nazwach plików to dzień wgrania.

| # | Plik | Etap | Zawartość |
|---|---|---|---|
| M1 | `…_native_devices.sql` | 1 | **Tabela `devices`:** id z aplikacji (uuid pk), `user_id` (FK `auth.users` on delete cascade), name, bundle_id, app_version, os_version, apns_token, apns_env (`sandbox`/`production`), widget_push_token, controls_push_token, push_enabled, capabilities jsonb, `health_synced_through date`, last_seen_at, revoked_at, created_at.<br>**Tabela `device_secrets(device_id pk, secret_hash bytea unique)`:** RLS włączone, bez polityk, dostęp tylko przez funkcje security definer.<br>**RLS `devices`:** select tylko własnych wierszy, zapisy wyłącznie przez RPC.<br>**`profiles.push_target`:** `web`/`native`/`both`, domyślnie `web`.<br>**RPC:**<br>• `register_device(...)` dla authenticated; ten sam `device_id` u innego użytkownika to błąd, u tego samego podmienia hash;<br>• `revoke_device(p_device_id)`, gdzie `null` oznacza wszystkie urządzenia, dla authenticated;<br>• `device_revoke_self(p_secret)` dla anon;<br>• wewnętrzne `device_owner(p_secret, out user_id, out device_id, out today)` na wzór `token_owner`, bez EXECUTE dla ról API; `last_seen_at` aktualizuje najwyżej raz na 5 min;<br>• `device_set_push(p_secret, p_token, p_env)` dla anon, security definer. |
| M2 | `…_entry_origin.sql` | 1 | **Nowe kolumny:** `habit_entries.origin` (check: `web`, `app`, `widget`, `notification`, `control`, `siri`, `health`, `screen_time`, `duolingo`; NULL to stare wpisy i stare API Skrótów) oraz `device_id` (FK `devices` on delete set null).<br>**Funkcje wewnętrzne** `_entry_set` / `_entry_add` / `_entry_clear(p_uid, …, p_origin, p_device)`: security definer, bez EXECUTE dla ról API. Same sprawdzają, że `habits.user_id = p_uid`, bo omijają RLS, i liczą „dziś” z profilu `p_uid` zamiast `user_today()`. `user_id` wstawiają jawnie, bo `default auth.uid()` jest tu NULL.<br>**Funkcje publiczne** `set_entry` / `add_entry` / `clear_entry` zachowują sygnatury i granty i wołają wersje wewnętrzne z `auth.uid()` i `origin = 'web'`.<br>Plik rollback zawiera kopie obecnych ciał funkcji z `20261024090000_entry_note_clear.sql` i `20261025090000_audit_fixes.sql`. |
| M3 | `…_device_api.sql` | 1 | **`device_snapshot(p_secret)`** zwraca jeden JSON:<br>• profil (timezone, week_start, day_start_hour);<br>• nawyki (z zarchiwizowanymi w ostatnich 14 dniach) i plany;<br>• **całą historię wpisów** bez notatek, bo `streakOf` potrzebuje jej od `start_date`;<br>• pauzy;<br>• daty i nastroje z `day_notes` z 60 dni (bez treści), bo `absence()` ich używa;<br>• `health_daily` z 8 dni;<br>• wiersz urządzenia.<br>**`device_apply_entries(p_secret, p_ops)`** przyjmuje do 200 operacji, każdą w osobnym bloku `BEGIN … EXCEPTION`. Reguły są w tabeli niżej. Czyści `entry_adds` starsze niż 35 dni. |
| M4 | `…_health_v2.sql` | 3 | **Nowe metryki:** `swim_workouts`, `workout_min` (wariant Garmin dla „Ruchu”), `sleep_early_min`, `dietary_kcal`. Trzeba je dopisać w `habits_source_check`, `health_daily_metric_check` oraz w `HEALTH_METRICS` i `METRIC_INFO` w `lib/domain/health.ts` (używa ich też `HabitEditor`). `ingest_metrics` zostaje bez zmian.<br>**`health_daily`:** nowe kolumny `measured_at` i `device_id`.<br>**`device_ingest_health(p_secret, p_days)`:** do 35 dni; każdy dzień to `{date, metrics, final}`. Ustawia `devices.health_synced_through` na najnowszy dzień oznaczony `final`.<br>**Nadpisywanie:** w `health_daily` wartość z nowszym `measured_at` zastępuje starszą (HealthKit potrafi skorygować w dół). Wpisy nawyków count/duration dalej przez `greatest()`.<br>**Nawyki typu check:** dane powyżej progu podnoszą „nie dziś” (0) do 1. Wpisów `skipped` nie ruszają. Aktualizacje używają `where value is distinct from`, żeby nie przesuwać `updated_at` bez zmiany. |
| M5 | `…_auto_sources.sql` | 6–7 | `habits.source` dostaje `app_usage` i `duolingo` (z `source_min = 1`, bo wymaga tego `habits_source_threshold`); nowa kolumna `profiles.duolingo_user`; `cron.schedule` dla `poll-duolingo` |
| M6 | `…_retire_shortcut_api.sql` | 8, za zgodą | **Nie jest addytywna.** Usuwa `api_tokens`, `new_api_token`, `revoke_api_token`, `token_owner`, `token_habits`, `log_habit` i `ingest_metrics`, a w kodzie `/api/log`, `/api/ingest`, `lib/server/shortcut.ts`, `features/settings/{ShortcutKey,SiriShortcuts,HealthSync}.tsx` i odpowiadające asercje w `assertions.sql` |

**Format operacji w `device_apply_entries`:** `{op_id, kind, habit_id, date, value?, delta?, client_at, origin}`.

**Reguły dla każdej operacji:**
- `op_id` jest idempotentne dzięki `entry_adds` (z jawnym `user_id`). Ponowne wysłanie zwraca `duplicate`.
- Data musi mieścić się w `[max(start_date, today−30), today]`, gdzie `today` liczymy dla właściciela sekretu.
- Nawyk musi należeć do właściciela sekretu i nie może być zarchiwizowany.
- **`stale` dotyczy tylko operacji niemonotonicznych** (`no`, `set`, `skip`, `clear`): gdy `client_at` jest starsze niż `updated_at` istniejącego wpisu. `complete` i `add` są monotoniczne i nigdy nie dostają `stale`, więc późny sync zdrowia nie zjada odhaczenia z powiadomienia.
- Możliwe wyniki: `ok`, `duplicate`, `stale`, `ignored`, `error:<kod>`.

| kind | Efekt |
|---|---|
| `complete` | check → 1 (także z 0 albo pominięcia); count/duration → `greatest(obecna, cel z planu na ten dzień)`; dla `quit` błąd |
| `no` | 0 („nie dziś”), ale tylko gdy nie ma jeszcze wartości dodatniej; inaczej `ignored` |
| `add` | `+delta`, tak jak w `add_entry` |
| `set` / `skip` / `clear` | tak jak w PWA (`set_entry` / `clear_entry`) |

### 4.2 Vercel: `GET /api/v1/snapshot`

- **Plik i nagłówki:** `app/api/v1/snapshot/route.ts`, `Authorization: Bearer nwk_…`, klient anon jak w `lib/server/shortcut.ts`, `Cache-Control: no-store`. Odpowiedź 401 dla błędu 28000.
- **Obliczenia:**
  - wywołuje `device_snapshot`;
  - mapuje dane przez `toHabit` / `toPlan` / `toEntry` z `lib/data/snapshot.ts`; `toEntry` dostaje `note: null`;
  - liczy wynik nową czystą funkcją `lib/domain/nativeSnapshot.ts` z testami vitest;
  - używa `buildDay`, `badgeCount`, `yesterdayGap`, `absence`, `manualDates` i `streakOf`.
- **`proxy.ts`:** wykluczyć w `matcher` `api/v1` i `.well-known`, żeby nie wołać niepotrzebnie `getClaims` i nie przekierowywać do `/login`.
- **Przed pisaniem kodu** przeczytać `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (wymaga tego AGENTS.md).

```json
{ "v":1, "generatedAt":"…", "timezone":"Europe/Warsaw", "dayStartHour":0,
  "today":"2026-10-25", "nextDayStartsAt":"2026-10-25T23:00:00Z", "badge":3,
  "habits":[{"id","name","icon","color","kind","unit","goal","source","archived":false}],
  "yesterday":{"date":"2026-10-24","missingHabitIds":["…"]},
  "days":{"2026-10-24":Day,"2026-10-25":Day,"2026-10-26":Day},
  "device":{"healthSyncedThrough":"2026-10-24","revoked":false} }
Day = {"progress":{"done":2,"total":5},"items":[{"habitId","name","icon","color",
  "kind":"check|count|duration","unit","target","goal":"build|quit",
  "section":"todo|thisWeek|done|quit","state":"pending|partial|done|skipped|no",
  "value","week":{"done":1,"required":2}|null,"missedLast":true,"streak":4,
  "auto":{"source":"steps","value":5234,"min":7000}|null}]}
```

- **Lista `habits`** obejmuje wszystkie aktywne nawyki, także te niewymagane w żadnym z trzech dni (np. „co N dni”). Korzystają z niej `HabitEntity` / `HabitQuery` dla Siri i Controls.
- **Dzień jutrzejszy jest policzony z góry**, więc widżet przechodzi na nowy dzień bez sieci. `nextDayStartsAt` liczy serwer, także w dni zmiany czasu. 25.10.2026 to taki dzień: północ 26.10 CET to 2026-10-25T23:00Z.
- **Nowe pole `Entry.origin`** jest opcjonalne, więc `CACHE_VERSION` w `app/providers.tsx` się nie zmienia (zmiana skasowałaby kolejkę offline).

### 4.3 `send-reminders` z APNs

- **`logic.ts`.** `Message` dostaje pola `category` (`HABIT` | `MULTI` | `INFO`), `habitIds` i `forDate`. `quietMessage` musi zwracać też id nawyku z `easiestHabit`, bo dziś zwraca tylko tytuł i treść. Testy w `logic.test.ts`. Mapowanie:

  | Przypomnienie | Kategoria | `habitIds` / `forDate` |
  |---|---|---|
  | `habit`; push powrotu („Dziś wystarczy jedno”) | `HABIT` | ten jeden nawyk |
  | `summary` | `MULTI` | tylko codzienne, jak „Wszystko zrobione” w PWA (commit 595f4a5) |
  | `morning` / `day` / `evening` | `MULTI`, a przy jednym nawyku `HABIT` | nawyki z tej pory |
  | `yesterday` | `MULTI` | `gap.missing`; `forDate = gap.date` |
  | `weekly` | `INFO` | brak |

- **Nawyki z Apple Zdrowie, stan obecny.** `summary`, pory dnia i `habit` je pomijają (filtr `!i.habit.source`). **`yesterday` ich nie pomija**, bo `yesterdayGap` nie filtruje po źródle. To zostaje: jeśli Zdrowie odhaczyło nawyk przed 09:00, nie ma go na liście sam z siebie.
- **Nowa reguła dla Zdrowia.** Gdy `max(devices.health_synced_through)` jest starsze niż `gap.date`:
  - push 09:00 dostaje dopisek „Zdrowie nie zsynchronizowało się, otwórz Nawyki”;
  - nawyki ze źródłem wracają do wieczornego `summary`.

  Gdy synchronizacji nie było od 3 dni, raz dziennie idzie osobny push `HABIT` / `INFO`: „Otwórz Nawyki, żeby wznowić Apple Zdrowie”. DTS poleca taki push serwera, bo ręczne otwarcie aplikacji kasuje blokadę wybudzeń po zamknięciu jej przesunięciem.
- **Kanały w `src.ts`.**
  - Nowy moduł `apns.ts`. `src.ts` wczytuje `devices` użytkownika, a do selecta wpisów dodaje `origin`.
  - Wczesne `if (subs.length === 0) continue` musi uwzględniać urządzenia.
  - Kanał zależy od `push_target`:
    - `web`: jak dziś;
    - `both`: oba kanały, do testów;
    - `native`: APNs do aktywnych urządzeń (`revoked_at is null`, `apns_token` i `push_enabled`). Gdy nie ma takiego urządzenia albo `last_seen_at` jest starsze niż 7 dni, push idzie **także** przez Web Push. Lepszy duplikat niż zgubione przypomnienie po cichym odinstalowaniu.
  - Claim w `notification_log` jest jeden na wiadomość, a `delivered` sumujemy po kanałach. Gdy `delivered = 0`, claim jest zwalniany, jak dziś.
- **JWT.**
  - ES256 przez WebCrypto: `importKey('pkcs8')` z `.p8`; podpis ECDSA w WebCrypto to już r‖s, czyli format JWS.
  - Cache w zmiennej modułu na 50 min (Apple wymaga odświeżania nie rzadziej niż co 60 min).
  - Przy 403 `ExpiredProviderToken` / `InvalidProviderToken` podpisujemy raz jeszcze i ponawiamy.
  - Przy `TooManyProviderTokenUpdates` (429) wydłużamy cache. Dopiero gdy to się powtarza, dodajemy tabelę-cache.
- **Nagłówki:**
  - `apns-push-type: alert`;
  - `apns-topic: xyz.gmarczak.nawyki`;
  - `apns-priority` 10, dla `weekly` 5;
  - `apns-collapse-id: <tag>:<data>` (najwyżej 64 bajty);
  - `apns-expiration` +1 h, dla `yesterday` do 12:00. Apple traktuje to jako „best effort”;
  - `apns-id` to UUID zapisywany w logu.

  Host wybieramy według `devices.apns_env`: `api.sandbox.push.apple.com` albo `api.push.apple.com`.
- **Payload:** `{"aps":{"alert":{…},"badge":n,"sound":"default","category":"MULTI","thread-id":"yesterday","interruption-level":"time-sensitive"},"kind":"yesterday","date":"2026-10-24","habitIds":[…],"url":"/review?date=2026-10-24"}`. Limit to 4 KB. `time-sensitive` tylko dla 09:00 i dla pushu powrotu.
- **Błędy urządzenia.** Na 410 `Unregistered`, `BadDeviceToken` i `DeviceTokenNotForTopic` ustawiamy `apns_token = null`, a dalej działa fallback na Web Push. Apple zgłasza odinstalowanie z opóźnieniem, dlatego jest też reguła 7 dni.
- **Sekrety Edge Function:** `APNS_ENABLED` (wyłącznik), `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_KEY_ID_SANDBOX`, `APNS_KEY_P8_SANDBOX` (base64 w jednej linii, bo wieloliniowy PEM w env bywa ucinany).
  - Klucz APNs jest kluczem team-scoped tylko dla środowiska Sandbox. Apple zaleca osobne klucze dla każdego środowiska; limit to 2 na środowisko.
- **Tryb testowy i build.** `test_user_id` wysyła też APNs i zwraca `apns-id` oraz status. Po zmianach: `npm run build:functions` i deploy z `--no-verify-jwt`, jak w README.
- **Gdy test HTTP/2 z Etapu 0 wypadnie źle:** przekaźnik `app/api/internal/apns/route.ts` (runtime Node, `node:http2`), zabezpieczony nagłówkiem z sekretem crona. Edge function woła go zamiast APNs.

### 4.4 Web (tylko za `isNativeShell`, PWA bez zmian)

- **`lib/native.ts`:** wykrywanie po `window.__nawykiNative` (pewniejsze niż UA) i `postNative()`.
- **`app/providers.tsx`:** `window.__nawyki = { invalidate, navigate }` i rejestracja urządzenia po zalogowaniu (§3.2).
- **`features/shell/useAppBadge.ts`:** w powłoce `postNative('badge', count)` zamiast Badging API, którego WKWebView nie ma.
- **Powiadomienia** (`features/reminders/push.ts`, `ReminderSettings`, `ReminderPrompt`): zgoda przez most i nigdy Web Push w powłoce (WKWebView go nie obsługuje). Bez komunikatu „dodaj do ekranu”: `pushSupport()` zwraca dziś `ios-needs-install`, bo powłoka nie jest „standalone”.
- **`features/auth/LoginForm.tsx`:** w powłoce tylko hasło, bo link z maila otwiera Safari. Autouzupełnianie działa dzięki `webcredentials` (§3.4).
- **`features/today/HabitTimer.tsx`:** w powłoce `postNative('timer', {endsAt})` planuje lokalne powiadomienie, bo JS w tle jest wstrzymany. Opcjonalnie (Etap 3) natywna część zapisuje sesję uważności do Zdrowia.
- **Ustawienia:**
  - sekcja **„Urządzenia”**, widoczna także w PWA: lista, `last_seen_at`, `health_synced_through`, „Odwołaj”, „Odwołaj wszystkie” i `push_target`;
  - w powłoce przycisk **„Połącz z Apple Zdrowie”** zamiast `HealthSync` / `ShortcutKey`;
  - link **„Diagnostyka iOS”**.
- **`lib/domain/model.ts` / `lib/domain/nudges.ts`:** `Entry.origin?`. `manualDates()` ocenia obecność po `origin`: ręczne to `web`, `app`, `widget`, `notification`, `control`, `siri`. Dla NULL działa stara reguła po `habit.source`. Ta sama funkcja działa w PWA (`ComebackCard`) i w `send-reminders`.
- **`lib/data/snapshot.ts`:** mapuje `origin`.
- **`proxy.ts`:** `matcher` bez `api/v1` i `.well-known`.
- **`public/.well-known/apple-app-site-association`:** `{"webcredentials":{"apps":["<TEAMID>.xyz.gmarczak.nawyki"]}}`, wysyłany z `Content-Type: application/json`.

## 5. Etapy

| Etap | Treść | Dni |
|---|---|---|
| 0 | Przygotowanie i trzy testy techniczne | 1,5–2 |
| 1 | Backend: urządzenia, origin, API | 3–3,5 |
| 2 | Aplikacja-powłoka + NawykiKit | 3–4 |
| 3 | HealthKit w tle | 4–5 (+7 dni testu, telefon „zamrożony”) |
| 4 | Powiadomienia z akcjami (APNs); rozwój na Symulatorze w czasie testu z Etapu 3 | 3–4 |
| 5 | Widżety, Controls, App Shortcuts | 4–5 |
| **Rdzeń** | | **18,5–23,5** |
| 6 | Duolingo i Fitatu | 1–1,5 |
| 7 | Eksperyment Screen Time | 2–3 (+14 dni pomiaru) |
| 8 | Opcjonalnie: natywny Dziś (6–8), push do widżetów i Controls (1), Notification Service Extension dla pushu 09:00 (1), M6 (0,5) | 8,5–10,5 |

**Kolejność.** HealthKit idzie przed powiadomieniami z trzech powodów:
1. Ma najdłuższą pętlę zwrotną: 7 dni na prawdziwym telefonie bez kabla.
2. Nie zależy od niepewnego HTTP/2 z Edge Runtime.
3. Zmienia treść pushu 09:00, bo nawyki ze Zdrowia znikają z „wczoraj”.

W czasie testu nie wolno instalować na telefonie nowych buildów z Xcode: debugger zmienia throttling, a reinstalacja zabija proces. Etap 4 (powiadomienia) i Etap 5 (widżety) powstają w tym tygodniu na Symulatorze. Symulator na Macu z Apple silicon odbiera prawdziwe pushe z sandboxu APNs, a widżety i Controls też w nim działają. Na telefon trafiają po zakończeniu testu.

### Etap 0: Przygotowanie (1,5–2 dnia)

**Cel:** konto, identyfikatory i trzy testy, które mogą zmienić plan.

**Owner ręcznie:**
- **Konto:** Apple Developer Program (99 USD rocznie, weryfikacja trwa do około 48 h, więc trzeba zacząć od razu); zanotować Team ID. Bez płatnego konta Family Controls (Development) i HealthKit background delivery nie zadziałają (Personal Team ich nie obsługuje).
- **Sprzęt:** Mac **z Apple silicon** (Xcode 27 nie wspiera Intela) z macOS Tahoe 26.6+ i Xcode 27 (Swift 6.4). Na iPhonie włączony Developer Mode. Debugowanie na urządzeniu wymaga iOS 17+.
- **Identifiers:**
  - App ID `xyz.gmarczak.nawyki` z: Push Notifications, App Groups, HealthKit (z Background Delivery), Time Sensitive Notifications, Associated Domains;
  - App ID `.widgets` z App Groups (Push dopiero w Etapie 8);
  - App ID `.notification-content` z App Groups;
  - App ID `.activity-monitor` w Etapie 7;
  - App Group `group.xyz.gmarczak.nawyki`.

  Keychain Sharing nie wymaga konfiguracji w portalu, wystarczy entitlement.
- **APNs:** w Keys utworzyć klucz APNs typu team-scoped dla środowiska **Sandbox**. Zanotować Key ID. Plik .p8 da się pobrać tylko raz. Wgrać przez `supabase secrets set` jako base64.
- **Dystrybucja: instalacja z Xcode**, podpis deweloperski, konfiguracja Release (`aps-environment = development`, czyli APNs sandbox).
  - Profil i certyfikat są ważne rok, więc warto ustawić przypomnienie w kalendarzu na 11. miesiąc.
  - TestFlight odpada: buildy wygasają po 90 dniach, potrzebny byłby produkcyjny APNs i wniosek o Family Controls Distribution. Kolumna `apns_env` zostawia furtkę.
- **Vercel:** domena `beta.nawyki.gmarczak.xyz` przypięta do gałęzi preview.

**Zakres (sesja AI):**
- **Szkielet iOS:** `ios/project.yml` ze wszystkimi targetami, entitlements, `keychain-access-groups`, `BGTaskSchedulerPermittedIdentifiers` (`xyz.gmarczak.nawyki.refresh`), `UIBackgroundModes` (`fetch`, `remote-notification`), `NSHealthShareUsageDescription` (odczyt) i `NSHealthUpdateUsageDescription` (tylko jeśli minutnik ma zapisywać medytację) oraz `com.apple.developer.associated-domains`. Do tego `ios/README.md` z instrukcją `xcodegen generate`.
- **Test 1, HTTP/2 i JWT:** `supabase/functions/apns-probe` podpisuje prawdziwy JWT i wysyła POST do `https://api.sandbox.push.apple.com/3/device/00`.
  - Odpowiedź `{"reason":"BadDeviceToken"}` oznacza, że HTTP/2 i podpis działają.
  - `MissingProviderToken` albo `InvalidProviderToken` oznacza, że HTTP/2 działa, ale podpis jest zły.
  - Brak JSON albo błąd połączenia oznacza przekaźnik z §4.3. Deno `fetch` negocjuje HTTP/2 przez ALPN, ale dla Supabase Edge Runtime nikt tego publicznie nie potwierdził.
- **Test 2, service worker w WKWebView:** powłoka z App-Bound Domains ładuje produkcję, potem tryb samolotowy i zimny start. Wynik: strona z cache albo decyzja „natywny ekran Brak sieci”.
- **Test 3, XcodeGen i Xcode 27:** wszystkie targety budują się i instalują. Jeśli nie, zapasowy wariant z §1.5.
- **Vercel:** `vercel.json` z `"regions": ["fra1"]`, redeploy, smoke test PWA.

**Gotowe, gdy:**
- pusta aplikacja z WKWebView i widżetem-zaślepką instaluje się z Xcode i startuje po odłączeniu kabla oraz po restarcie telefonu;
- `apns-probe` zwraca `BadDeviceToken`;
- wynik testu service workera jest zapisany w `ios/README.md`;
- nagłówek `x-vercel-id` w odpowiedzi produkcji zawiera `fra1`.

**Wycofanie:** nic na produkcji poza regionem; powrót do iad1 to jedna linia w `vercel.json`.

**Ryzyka:** HTTP/2 z Supabase Edge Runtime (+0,5–1 dnia na przekaźnik); kompatybilność XcodeGen z Xcode 27.

### Etap 1: Backend (3–3,5 dnia)

**Zakres:**
- migracje M1–M3 z plikami rollback;
- `lib/domain/nativeSnapshot.ts` z testami i `app/api/v1/snapshot/route.ts`;
- `matcher` w `proxy.ts`;
- sekcja „Urządzenia” i `manualDates` według `origin`;
- skrypt `scripts/register-test-device.mjs`: logowanie hasłem, lokalnie wygenerowany sekret, `register_device`. Służy do testów przed powstaniem powłoki.

**Testy SQL w `assertions.sql`:**
- zły sekret kończy się błędem 28000;
- cudzy nawyk i nawyk zarchiwizowany kończą się błędem;
- powtórzony `op_id` daje jeden zapis i wynik `duplicate`;
- `stale` dotyczy tylko `no`/`set`/`skip`/`clear`, a `complete` po zapisie zdrowia przechodzi;
- `complete` dla `quit` kończy się błędem;
- data spoza okna kończy się błędem;
- odwołane urządzenie zostaje odrzucone;
- anon nie czyta `devices` ani `device_secrets` i nie wykona `_entry_*` ani `device_owner`;
- **istniejące asercje `set_entry`/`add_entry`/`clear_entry` przechodzą bez zmian.**

**Owner:** akceptuje migracje przed wgraniem na produkcję.

**Gotowe, gdy:**
- CI jest zielone: typecheck, lint, vitest, build i job `database`;
- curl z testowym sekretem do produkcji: p50 < 300 ms z 5 kolejnych wywołań przy ciepłej funkcji, a `x-vercel-id` zawiera `fra1`;
- „Odwołaj” w „Urządzeniach” sprawia, że ten sam curl dostaje 401;
- PWA działa bez zmian według listy kontrolnej: odhaczenie, „+1”, minutnik, „nie dziś”, przegląd wczoraj, testowe przypomnienie (`test_user_id`).

**Wycofanie:** `supabase/rollback/…_entry_origin.down.sql` przywraca stare ciała funkcji. Nowe tabele i route mogą zostać nieużywane.

**Ryzyka:** refaktor `set_entry`/`add_entry`/`clear_entry` dotyka wielu zachowań PWA. Mitygacja: istniejące asercje oraz to, że publiczne sygnatury i granty się nie zmieniają.

### Etap 2: Aplikacja-powłoka i NawykiKit (3–4 dni)

**Zakres:**
- **`ios/Nawyki/WebContainer`:**
  - most i App-Bound Domains (§3.4);
  - ekran „Brak sieci”;
  - linki z powiadomień: `__nawyki.navigate(url)`, a przy zimnym starcie wczytanie bazowego adresu + url;
  - `webcredentials`.
- **Przydział sekretu** (§3.2) i czyszczenie Keychain przy pierwszym starcie.
- **NawykiKit:**
  - `Credentials`, `APIClient`, `SnapshotStore`;
  - `Outbox`, wysyłany przy starcie, przy powrocie na pierwszy plan, w `BGAppRefreshTask` i **przy każdym wybudzeniu w tle**.
- **Arkusz „Diagnostyka”:**
  - ostatnie wybudzenia (`sync-log.jsonl`), zawartość outboxu, status sekretu i `apns_env`;
  - w Debug przełącznik `beta.`.
- **Web:** zmiany z §4.4 bez powiadomień. Ustawienie powiadomień jest w powłoce ukryte do Etapu 4, a PWA dalej wysyła Web Push.

**Owner:** loguje się w aplikacji i sprawdza „Urządzenia” w PWA.

**Gotowe, gdy:**
- logowanie tworzy wiersz w `devices`, a w JS nie ma sekretu (sprawdzić w Web Inspectorze `window.__nawykiNative`);
- wszystkie ekrany działają jak w PWA: safe area, swipe w wierszach, brak białego błysku, autouzupełnianie hasła;
- start w trybie samolotowym pokazuje Dziś z cache albo „Brak sieci”;
- liczba na ikonie zgadza się z PWA;
- usunięcie i ponowna instalacja daje ekran logowania i nowe `device_id`, a stare urządzenie widać w „Urządzeniach” do odwołania;
- wylogowanie odwołuje urządzenie także bez sieci (`device_revoke_self` z kolejki);
- **test w tle, nieblokujący:** po ≥ 8 dniach bez otwierania aplikacja dalej jest zalogowana. To odpowiada 9-dniowej przerwie ownera i 7-dniowemu limitowi ITP dla danych zapisywanych skryptem.

**Wycofanie:** usunąć aplikację. PWA jest nietknięta, bo zmiany są za flagą.

**Ryzyka:** service worker w WKWebView (rozstrzygnięty w Etapie 0); trwałość cookie i IndexedDB w WKWebView.

### Etap 3: HealthKit w tle (4–5 dni + 7 dni testu bez kabla)

**Zakres:**
- **Backend:** M4.
  - Metryki trafiają do `lib/domain/health.ts` (`HEALTH_METRICS`, `METRIC_INFO`) i do edytora nawyków w PWA **przed** ustawieniem źródeł. Inaczej `toHabit` zamieni nieznane źródło na `null`, a `HabitEditor` zapisze to przy pierwszej edycji.
  - `logic.ts`: dopisek „Zdrowie nie zsynchronizowało się” oraz push po 3 dniach bez synchronizacji (§4.3). Działa też dla Web Push.
- **`SyncEngine` (actor) w aplikacji:**
  - obserwatory rejestrowane w `didFinishLaunching` przez `@UIApplicationDelegateAdaptor` (tak każe dokumentacja HealthKit);
  - `enableBackgroundDelivery(.immediate)`, przy czym kroki system i tak dostarcza najwyżej co godzinę;
  - dni liczone według strefy z profilu i `day_start_hour` (`DayWindow`, z obsługą zmiany czasu);
  - wysyła dziś i 2 dni wstecz, a przy otwarciu aplikacji 30 dni;
  - dzień jest `final`, gdy synchronizacja odbyła się po jego końcu; późniejsze dane z zegarka dalej go nadpisują;
  - wysyła tylko metryki, które mają dane (zer nie wysyłamy);
  - przy każdym wybudzeniu najpierw wysyła outbox;
  - **zawsze** woła `completionHandler()`, także przy błędzie i timeoucie.
- **Dodatki:**
  - `BGAppRefreshTask` z `earliestBeginDate` 07:00. System nie daje gwarancji, a przy zablokowanym telefonie HealthKit jest niedostępny, więc zadanie głównie wysyła outbox i odświeża snapshot;
  - opcjonalne lokalne powiadomienie „Spacer odhaczony: 8 234 kroków”, domyślnie wyłączone;
  - w powłoce ekran „Połącz z Apple Zdrowie” i jedno zdanie: „Nie zamykaj Nawyków przesunięciem w górę, bo wtedy Zdrowie przestaje je budzić”;
  - w Debug przycisk w „Diagnostyce”: zapisz i potem usuń próbne treningi (pływanie 15 min, bieg 20 min) dla dnia testowego.

**Owner:** daje zgodę HealthKit, ustawia źródła nawyków w PWA (§6) i przez 7 dni żyje normalnie: bez instalacji z Xcode i bez zamykania aplikacji przesunięciem.

**Gotowe, gdy:**
- przez 7 dni `sync-log` pokazuje co najmniej jedno wybudzenie dziennie, a Spacer odhacza się w ciągu 2 h od przekroczenia progu, licząc czas, gdy telefon był odblokowany;
- próbny trening pływacki odhacza Basen, a próbny bieg nie;
- po 3 dniach bez otwierania aplikacji jej otwarcie uzupełnia luki (`health_synced_through` = wczoraj);
- push 09:00 nie wymienia nawyków, które Zdrowie już odhaczyło.

**Wycofanie:**
- w PWA wyczyścić `habits.source` (nawyk wraca do ręcznego);
- złe dane usunąć przez `delete from health_daily where device_id = …`;
- w ostateczności odwołać urządzenie.

**Ryzyka:**
- bez Apple Watcha nie ma `appleExerciseTime`, a „Ruch” idzie przez `workout_min` (Garmin);
- na zablokowanym telefonie HealthKit nic nie oddaje;
- zamknięcie aplikacji przesunięciem wyłącza wybudzenia do ręcznego otwarcia;
- po 1–2 tygodniach bez używania aplikacji dostarczanie może wygasnąć.

### Etap 4: Powiadomienia z akcjami (3–4 dni)

**Zakres:**
- **Backend:** zmiany z §4.3. Nowa migracja nie jest potrzebna.
- **Rejestracja:** token APNs trafia do `device_set_push` razem z `apns_env` (stała z `project.yml`).
- **Kategorie** (rejestrowane przy każdym starcie):
  - `HABIT`: „Zrobione” (`complete`) i „Nie dziś” (`no`), obie bez `.foreground`;
  - `MULTI`: „Wszystko zrobione” (`complete` dla `habitIds` z `forDate`) bez `.foreground` oraz „Uzupełnij” z `.foreground`, które otwiera `url`;
  - `INFO`: bez akcji;
  - `.authenticationRequired` zależy od odpowiedzi ownera (§8, pytanie 7).
- **Handler `didReceive`:**
  1. `beginBackgroundTask`.
  2. Zapis do outboxu (deterministyczne `op_id` = UUIDv5 z `apns-id` + `habitId`) i aktualizacja snapshotu.
  3. Przeładowanie widżetów i Controls.
  4. Wysyłka do API z limitem 8 s.
  5. `setBadgeCount`.
  6. Usunięcie powiadomień, na które już odpowiedziano.
  7. Wywołanie completion handlera.
- **`NawykiNotificationContent` dla `MULTI`:** wiersz na nawyk z przyciskami „odhacz” i „nie”, przez `UIHostingController` z jawnym `preferredContentSize`. Rozszerzenie samo pisze do outboxu i wysyła.
- **Rozwój i testy:** na Symulatorze (prawdziwe pushe z sandboxu) w czasie testu z Etapu 3, potem na telefonie.

**Owner:** ustawia `push_target = both` na 2–3 dni, potem `native`.

**Gotowe, gdy:**
- „Zrobione” na zablokowanym telefonie zapisuje wpis z `origin = notification`, widoczny w PWA w ciągu minuty;
- rozwinięty push 09:00 pozwala odhaczyć każdy nawyk osobno;
- przy `native` nie przychodzi Web Push (sprawdzić w `notification_log` i na ekranie);
- po „Odwołaj urządzenie” w PWA kolejne przypomnienie przychodzi przez Web Push. Odinstalowanie jest raportowane przez APNs z opóźnieniem, dlatego to kryterium opiera się na odwołaniu;
- akcja w trybie samolotowym trafia do outboxu i wysyła się po powrocie sieci („Diagnostyka” pokazuje pusty outbox).

**Wycofanie:** `push_target = web` działa natychmiast. Globalnie: `supabase secrets set APNS_ENABLED=false`.

**Ryzyka:** pomylenie sandbox z production; Skupienie i Zaplanowane podsumowanie (owner może wyłączyć time-sensitive); HTTP/2 (przekaźnik).

### Etap 5: Widżety, Controls, App Shortcuts (4–5 dni)

**Zakres:**
- **`TodayWidget`:**
  - rozmiary: small (pierścień i następny nawyk), medium (4 wiersze), large (wszystkie nawyki plus tygodniowe, np. Basen 1/2);
  - przed 12:00 sekcja „Wczoraj”, jeśli zostały luki;
  - `Toggle(isOn:intent:)` dla nawyków check i `Button(intent:)` z `complete` dla count/duration;
  - parametry intencji ustawione z góry, bo widżet ich nie rozwiązuje; data zawsze w intencji, nigdy „dziś”;
  - timeline: teraz, 12:00 i `nextDayStartsAt`.
- **`perform()`:**
  1. Wysłanie zaległego outboxu.
  2. Nowa operacja w outboxie.
  3. Aktualizacja snapshotu.
  4. Sieć z limitem 5 s.
  5. Podmiana snapshotu.
  6. Powrót z funkcji, po czym system sam przeładowuje timeline.

  Kropka „niezsynchronizowane” sygnalizuje zaległe zapisy. Toggle zmienia się optymistycznie, więc przy błędzie widżet musi pokazać prawdziwy stan.
- **Nawyki rzucane:** w widżecie tylko podgląd.
- **Ekran blokady:** `accessoryCircular` (Gauge), `accessoryRectangular` („3/6 · Spacer, Czytanie” plus przycisk „odhacz następny”) i inline. Przyciski na ekranie blokady działają dopiero po odblokowaniu (Face ID).
- **`HabitControl`:** `ControlWidgetToggle` z akcją `SetValueIntent`, konfigurowalny przez `AppIntentControlConfiguration` z parametrem `HabitEntity`. Controls domyślnie działają bez odblokowania; Apple zaleca rozważyć wymaganie uwierzytelnienia (`authenticationPolicy`, §8).
- **`AppShortcutsProvider`:** LogHabit, LogHabit na wczoraj, AnswerNo, WhatsLeft.
  - App Shortcuts działają bez konfiguracji: owner nie zakłada żadnych Skrótów, a frazy działają w Siri i w Spotlight;
  - frazy w języku Siri ownera (najpewniej angielskim, np. `"Log \(\.$habit) in \(.applicationName)"`), a tytuły po polsku dla Spotlight;
  - synonimy nazw: Spacer → walk, Basen → pool/swim, Medytacja → meditation, Czytanie → reading;
  - `updateAppShortcutParameters()` po każdej zmianie listy nawyków (`dataChanged`).

**Owner:** dodaje widżety oraz Controls do Centrum sterowania, ekranu blokady i przycisku czynności.

**Gotowe, gdy:**
- stuknięcie zapisuje wpis z `origin = widget` i widżet od razu pokazuje nowy stan;
- na granicy dnia (także 25.10) widżet przechodzi na nowy dzień bez sieci;
- Control na zablokowanym telefonie zapisuje wpis z `origin = control`, albo, przy wybranej polityce, prosi o Face ID;
- „Log Spacer in Nawyki” działa w Siri (jeśli Siri jest po angielsku), a „Spacer” w Spotlight pokazuje akcję;
- zmiana z PWA pojawia się w widżecie najpóźniej przy następnym otwarciu aplikacji albo przy kolejnym wpisie w timeline.

**Wycofanie:** usunąć widżet i Controls z ekranów. Serwera nie trzeba ruszać.

**Ryzyka:** budżet odświeżania widżetów (przeładowania wywołane z aplikacji w tle się do niego liczą); przyciski są nieaktywne przy zablokowanym telefonie.

### Etap 6: Duolingo i Fitatu (1–1,5 dnia)

**Owner najpierw sprawdza:**
- `curl "https://www.duolingo.com/2017-06-30/users?username=<nick>&fields=streak,streakData"` z Maca. Endpoint jest nieoficjalny i nie ma źródeł z 2026 roku;
- czy Fitatu jest w Zdrowie → Przeglądaj → Odżywianie → Energia spożyta → Źródła.

**Zakres:**
- **Backend:** M5.
- **Duolingo:** edge function `poll-duolingo` (pg_cron co godzinę, service role).
  - **Najpierw tryb `dry_run` z Supabase**, bo Duolingo może blokować adresy centrów danych inaczej niż domowy adres Maca.
  - Gdy `streakData.currentStreak.endDate` to dziś w strefie ownera, funkcja woła `_entry_set` z `origin = duolingo` i `op_id` = UUIDv5(`duolingo:<data>`).
- **Fitatu:** `dietaryEnergyConsumed` (opcjonalnie tylko ze źródła Fitatu) trafia do `dietary_kcal`; nawyk check z progiem ≥ 800 kcal.

**Gotowe, gdy:** lekcja odhacza nawyk w ciągu godziny, a wpisanie posiłków odhacza Fitatu po synchronizacji.

**Wycofanie:** `cron.unschedule('poll-duolingo')` i wyczyszczenie `habits.source`.

**Ryzyka:** nieoficjalny endpoint Duolingo może zniknąć bez ostrzeżenia.

### Etap 7: Eksperyment Screen Time (2–3 dni + 14 dni pomiaru)

Projekt eksperymentu jest w §6.

**Owner:** dodaje capability Family Controls (Development) do App ID aplikacji i `.activity-monitor`. Przy automatycznym podpisywaniu Xcode zrobi to sam. Apple nie musi tego zatwierdzać, bo wniosek dotyczy tylko TestFlight i App Store.

**Gotowe, gdy:** zapadła decyzja „zostaw” albo „usuń” na podstawie kryterium z §6.

**Wycofanie:** usunąć target i `habits.source = 'app_usage'`.

### Etap 8: Opcjonalnie

- **Natywny ekran Dziś i Przegląd** (6–8 dni). Wyświetla ten sam JSON `/api/v1/snapshot` i dzieli outbox z widżetem. Decyzja po 3–4 tygodniach używania.
- **Push do widżetów i Controls** (1 dzień), wysyłany z crona, gdy `habit_entries.updated_at` jest nowsze niż ostatni taki push:
  - widżety: od iOS 26 przez `WidgetPushHandler`, `apns-push-type: widgets`, topic `xyz.gmarczak.nawyki.push-type.widgets`, payload `{"aps":{"content-changed":true}}`;
  - Controls: od iOS 18 przez `ControlPushHandler`, `apns-push-type: controls`, topic `….push-type.controls`;
  - oba rodzaje mają budżet i są dostarczane oportunistycznie;
  - widżet wymaga Push w App ID `.widgets`.
- **Notification Service Extension dla pushu 09:00** (1 dzień): przed wyświetleniem usuwa z listy nawyki już odhaczone lokalnie (outbox, snapshot). Jeśli telefon jest odblokowany, próbuje też odczytać HealthKit, co sugeruje DTS.
- **M6: wycofanie API Skrótów** (0,5 dnia, za zgodą ownera).

## 6. Automatyczne odhaczanie

| Nawyk | Typ HealthKit | Próg | Częstotliwość | Metryka serwera | Źródło danych |
|---|---|---|---|---|---|
| Spacer | `stepCount`, `HKStatisticsQuery` `.cumulativeSum` (Zdrowie samo usuwa duplikaty między iPhone'em a zegarkiem) | ≥ 7000 kroków | codziennie, check | `steps` (jest) | sam iPhone wystarczy; Garmin też zapisuje kroki |
| Ruch | **Apple Watch:** `appleExerciseTime`. **Garmin:** suma czasu treningów (`HKWorkout.duration`) | ≥ 30 min | codziennie, duration | `exercise_min` (jest) albo **`workout_min`** | minuty ćwiczeń liczy tylko Apple Watch; Garmin zapisuje treningi, nie minuty ćwiczeń |
| Medytacja | `mindfulSession`, nakładające się przedziały scalone | ≥ 5 min | codziennie, duration | `mindful_min` (jest) | aplikacja do medytacji zapisująca do Zdrowia; opcjonalnie minutnik Nawyków przez most |
| Basen | `HKWorkoutType` + `predicateForWorkouts(with: .swimming)`, ≥ 10 min | 1 trening/dzień | 2× w tygodniu | **`swim_workouts`** | Watch albo Garmin (sprawdzić, czy pływanie z Garmina ma typ `.swimming`) |
| Sen przed 23:00 | `sleepAnalysis` (`allAsleepValues`), noc D = [D 18:00, D+1 14:00), początek głównego snu | `sleep_early_min` ≥ 60 (minuty od zaśnięcia do północy) | codziennie, check | **`sleep_early_min`** | Watch albo Garmin (zapisuje sen); dane przychodzą rano, przed przeglądem 09:00 |
| Fitatu (nowy) | `dietaryEnergyConsumed` | ≥ 800 kcal | codziennie | **`dietary_kcal`** | Fitatu zapisuje do Zdrowia (do sprawdzenia) |
| Duolingo (nowy) | brak, odpytywanie serwera | seria przedłużona dziś | codziennie | `origin = duolingo` | publiczny profil |
| Czytanie, 2 nawyki rzucane | brak | – | – | – | ręcznie: widżet, Control albo powiadomienie |

**Zasady działania:**
- HealthKit sam pełni rolę kolejki: sumy liczymy od nowa, więc ponowne wysłanie jest bezpieczne.
- Nie wysyłamy zer tam, gdzie nie ma danych. HealthKit nie zdradza odmowy dostępu do odczytu, bo odmowa wygląda jak brak danych.
- Kroki budzą aplikację najwyżej raz na godzinę (dokumentacja Apple), a częstotliwość nie jest gwarantowana (DTS, kwiecień 2026). Przy zablokowanym telefonie dane HealthKit są niedostępne, więc wybudzenia przychodzą po odblokowaniu.
- Zabezpieczenia:
  - uzupełnianie 30 dni przy każdym otwarciu;
  - wysyłka outboxu przy każdym wybudzeniu;
  - `BGAppRefreshTask`;
  - dopisek w pushu 09:00, gdy synchronizacja jest nieaktualna;
  - push „otwórz Nawyki” po 3 dniach bez synchronizacji.

**Screen Time: werdykt.** Technicznie wykonalne dla prywatnego buildu z Xcode: Family Controls (Development) działa w płatnym programie bez zatwierdzania przez Apple. Niezawodność jest niska lub średnia. Deweloperzy zgłaszają podwójne wywołania progu, zdarzenia za wczesne i brakujące oraz zmienione zachowanie `includesPastActivity`. Do tego „5 minut w aplikacji” to nie to samo co „zrobiona lekcja”. Dlatego Duolingo idzie przez API, Fitatu przez HealthKit, a Screen Time zostaje eksperymentem tylko dla aplikacji bez lepszego sygnału.

**Projekt eksperymentu:**
1. **Zgoda i wybór aplikacji:** `AuthorizationCenter.shared.requestAuthorization(for: .individual)`, potem `FamilyActivityPicker`. Nieprzezroczyste tokeny zapisujemy w App Group razem z mapowaniem token → `habit_id`.
2. **Monitorowanie:** `DeviceActivityCenter.startMonitoring` z dziennym harmonogramem 00:00–23:59 (`repeats: true`, granica według `day_start_hour`) i zdarzeniami na 5 i 10 min. `includesPastActivity: true` trzeba ustawić jawnie: od iOS 17.4 domyślne jest `false`.
3. **Monitor:** `eventDidReachThreshold` zapisuje operację `complete` (`origin = screen_time`, `op_id` = UUIDv5(`screen_time:<habit>:<data>`), więc podwójne wywołania nic nie psują) do outboxu i wpis do logu. Potem próbuje POST z limitem 3 s.
   - Dostęp do sieci z DeviceActivityMonitor nie jest udokumentowany; rozszerzenie DeviceActivityReport ma go jawnie zablokowanego.
   - Jeśli POST nie przejdzie, outbox wyśle aplikacja przy najbliższym wybudzeniu (HealthKit co godzinę, BGAppRefresh, otwarcie).
   - Tylko Foundation, bo zgłaszany limit pamięci to 6 MB.
4. **Pomiar:** przez 14 dni, raz w tygodniu, owner porównuje log w „Diagnostyce” z Ustawienia → Czas przed ekranem.
5. **Kryterium:** co najmniej 13 z 14 dni zgodnych i zero fałszywych odhaczeń. Wtedy `habits.source = 'app_usage'`. W przeciwnym razie usuwamy target.

## 7. Ryzyka i ograniczenia Apple

- **HealthKit w tle:**
  - dostarczanie jest „best effort”, a kroki przychodzą najwyżej co godzinę;
  - przy zablokowanym telefonie dane są niedostępne;
  - zamknięcie aplikacji przesunięciem ustawia flagę blokującą start w tle, którą kasuje dopiero ręczne otwarcie (DTS, październik 2025);
  - według DTS (sierpień 2024) dostarczanie gaśnie po około 1–2 tygodniach „nieaktywności”, co pasuje do 9-dniowej przerwy ownera;
  - trzy niewywołane `completionHandler` wyłączają dostarczanie (dokumentacja Apple).

  Mitygacje: uzupełnianie przy otwarciu, BGAppRefresh, ostrzeżenie w pushu i push „otwórz Nawyki” (zalecany przez DTS). Symulator nie testuje tego mechanizmu, a podpięty debugger zmienia throttling, więc testy robimy bez kabla i bez reinstalacji.
- **Widżety:** przyciski i przełączniki są nieaktywne przy zablokowanym telefonie, także w `accessoryCircular`/`accessoryRectangular` na ekranie blokady. Odświeżanie ma budżet.
- **Controls:** domyślnie działają przy zablokowanym telefonie. `IntentAuthenticationPolicy` pozwala wymusić odblokowanie.
- **Uprawnienia:**
  - samoobsługowe w płatnym programie: HealthKit z Background Delivery, Push, Time Sensitive, App Groups, Keychain Sharing, Associated Domains, Family Controls (Development);
  - Personal Team (darmowe konto) nie obsługuje Family Controls;
  - Family Controls Distribution wymaga wniosku (tygodnie oczekiwania, zdarzają się przydziały na cały team), ale przy instalacji z Xcode jest niepotrzebny;
  - App Review nas nie dotyczy.
- **Wygasanie:**
  - profil i certyfikat deweloperski działają rok, potem trzeba przebudować i zainstalować;
  - wygaśnięcie członkostwa w programie wyłącza aplikację po wygaśnięciu profilu, a PWA zostaje jako zapas;
  - sekret urządzenia nie wygasa, ale jest hashowany, `ThisDeviceOnly`, ma wąski zakres, nigdy nie trafia do JS i da się go odwołać;
  - zmiana hasła w PWA świadomie nie odwołuje urządzeń, a do tego służy „Odwołaj wszystkie”;
  - wpisy w Keychain przeżywają odinstalowanie, dlatego czyścimy je przy pierwszym starcie.
- **APNs:**
  - sandbox i production się różnią; klucze team-scoped są przypisane do jednego środowiska, najwyżej 2 na środowisko;
  - JWT odświeżamy nie częściej niż co 20 min **na jednym połączeniu** i nie rzadziej niż co 60 min;
  - Deno `fetch` negocjuje HTTP/2 przez ALPN, ale dla Supabase Edge Runtime nie jest to potwierdzone (test w Etapie 0);
  - APNs przy braku zasięgu trzyma tylko ostatnie powiadomienie dla aplikacji.
- **Siri:** Siri nie obsługuje polskiego. Nowa Siri AI w iOS 27 jest niedostępna w UE (spór o DMA), a rozszerzenie języków w iOS 27.1/27.2 nie obejmuje polskiego. Stąd frazy angielskie z synonimami, jeśli Siri ownera jest po angielsku; Spotlight działa po polsku. Ograniczenia App Shortcuts: najwyżej 10, nazwa aplikacji w każdej frazie, jeden parametr na frazę.
- **WKWebView:**
  - Web Push nie działa (DTS);
  - service worker wymaga App-Bound Domains (test w Etapie 0);
  - trwałość cookie i IndexedDB nie jest opisana, więc test trwa ≥ 8 dni.
- **XcodeGen:** zgodność z Xcode 27 niepotwierdzona; plan zapasowy w §1.
- **Vercel:** SSO na domenach innych niż własne, więc preview testujemy przez `beta.nawyki.gmarczak.xyz`.
- **Wspólny projekt Supabase** z aplikacjami swim, finance i garage: nigdy globalny `signOut`, migracje tylko ręcznie.

## 8. Otwarte pytania do ownera

### Odpowiedzi (2026-10-25)

- **Zegarek: Garmin, bez Apple Watcha.** Skutki dla planu:
  - **Ruch** liczymy z czasu treningów Garmina (`HKWorkout.duration`, metryka `workout_min` z M4). `appleExerciseTime` odpada, bo liczy go tylko Apple Watch.
  - **Spacer** z kroków, które zapisuje Garmin Connect i iPhone. Zdrowie samo usuwa duplikaty.
  - **Basen**: w Etapie 3 sprawdzić, czy „Pływanie w basenie” z Garmina trafia do Zdrowia jako `HKWorkoutActivityType.swimming`.
  - **Sen**: działa tylko, jeśli Garmin jest noszony w nocy (pytanie zostaje otwarte).
  - **Medytacja**: Garmin raczej nie zapisuje `mindfulSession`. W Etapie 3 sprawdzić, jako co trafia aktywność „Medytacja” lub „Oddychanie” z Garmina (np. trening `mindAndBody`). Jeśli nie trafia wcale, minutnik Nawyków zapisuje sesję do Zdrowia (pytanie 2).
  - Dane ze Zdrowia pojawiają się dopiero po synchronizacji Garmin Connect z iPhone'em (w tle, z opóźnieniem od minut do godzin). Wybudzenia HealthKit przyjdą więc po tej synchronizacji, a nie zaraz po treningu. To wystarcza, bo poranny przegląd jest o 09:00.
- **Mac: MacBook Air M2.** Apple silicon, więc Xcode 27 działa. Przed Etapem 0 sprawdzić macOS ≥ 26.6 (Tahoe) i wolne miejsce na dysku: Xcode z symulatorem iOS zajmuje około 40–50 GB.
- **Zamykanie aplikacji przesunięciem: nie.** Ryzyko z §7 (blokada startu w tle) nie dotyczy ownera.
- **`day_start_hour` = 0** (odczytane z bazy, `profiles.day_start_hour`).

### Pytania wciąż otwarte

1. Czy Garmina nosisz **w nocy** (Sen przed 23:00) i **na basenie** (Basen)?
2. Czym medytujesz? Czy minutnik Nawyków ma zapisywać sesje do Zdrowia (wymaga zgody na zapis)?
3. Jaki język ma Siri na Twoim iPhonie? Jaki to model iPhone'a (czy ma przycisk czynności) i jaka wersja iOS?
4. Progi: Spacer od 7000 kroków? Basen od 10 min? „Sen przed 23:00” liczony od zaśnięcia, i z jaką tolerancją?
5. Czy odhaczanie z powiadomień i Controls bez Face ID jest OK? Domyślnie zakładam, że tak.
6. Czy zgadzasz się na tydzień „zamrożenia” telefonu w Etapie 3 (bez instalacji z Xcode)?
7. Jaki jest Twój nick w Duolingo i czy profil jest publiczny? Czy Fitatu widać w Zdrowie → Źródła?

## 9. Słownik i źródła

**Słownik:**
- **APNs:** natywny push Apple.
- **App Group:** wspólny folder aplikacji i rozszerzeń.
- **Outbox:** kolejka operacji czekających na wysłanie.
- **Sekret urządzenia (`nwk_`):** długożyjący klucz natywnego kodu; w bazie tylko jego SHA-256.
- **Background delivery:** wybudzanie aplikacji przez HealthKit.
- **Controls:** przyciski w Centrum sterowania, na ekranie blokady i pod przyciskiem czynności.
- **App-Bound Domains:** lista domen, po których WKWebView może nawigować; od niej zależy service worker.
- **Operacja monotoniczna:** taka, która tylko zwiększa stan (`complete`, `add`), więc nie może być `stale`.

**Apple (dokumentacja):**
- Interaktywne widżety (rozmiary, blokada ekranu, proces intencji): https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities
- Controls: https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system
- `IntentAuthenticationPolicy`: https://developer.apple.com/documentation/appintents/intentauthenticationpolicy
- Push do widżetów (iOS 26): https://developer.apple.com/documentation/widgetkit/updating-widgets-with-widgetkit-push-notifications
- `ControlPushHandler` (iOS 18): https://developer.apple.com/documentation/widgetkit/controlpushhandler
- Akcje w powiadomieniach: https://developer.apple.com/documentation/usernotifications/declaring-your-actionable-notification-types
- APNs, token i klucze: https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- APNs, wysyłka, nagłówki i typy pushy: https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
- HealthKit background delivery (limit godzinny dla kroków, zasada trzech prób, entitlement): https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)
- Family Controls w Xcode: https://developer.apple.com/documentation/xcode/configuring-family-controls
- DeviceActivityReport, sandbox bez sieci: https://developer.apple.com/documentation/deviceactivity/deviceactivityreport
- `includesPastActivity` (iOS 17.4): https://developer.apple.com/documentation/deviceactivity/deviceactivityevent/includespastactivity
- App Shortcuts: https://developer.apple.com/documentation/appintents/appshortcutsprovider

**Apple Developer Forums:**
- HealthKit, częstotliwość niegwarantowana (DTS, kwiecień 2026): https://developer.apple.com/forums/thread/823699
- HealthKit, zamknięcie przesunięciem i push jako obejście (DTS, październik 2025): https://developer.apple.com/forums/thread/803365
- HealthKit, wygaszanie po 1–2 tygodniach (DTS, sierpień 2024): https://developer.apple.com/forums/thread/761045
- Web Push nie działa w WKWebView, service worker działa (DTS, lipiec 2024): https://developer.apple.com/forums/thread/760767
- Skutek uboczny App-Bound Domains: https://developer.apple.com/forums/thread/770366 (wątek 781744 to pytanie bez odpowiedzi, więc nie jest dowodem)
- Przycisk widżetu przy zablokowanym telefonie: https://developer.apple.com/forums/thread/766780
- Family Controls Distribution, przydział na cały team (DTS, maj 2026): https://developer.apple.com/forums/thread/828085
- DeviceActivityMonitor:
  - limit 6 MB (raport społeczności): https://developer.apple.com/forums/thread/735454
  - podwójne wywołania: https://developer.apple.com/forums/thread/741133
  - domyślne `includesPastActivity`: https://developer.apple.com/forums/thread/745675
- Keychain po odinstalowaniu: https://developer.apple.com/forums/thread/36442
- Autouzupełnianie haseł w WKWebView: https://developer.apple.com/forums/thread/654338

**Wersje platform:**
- iOS 27 (14.09.2026): https://macrumors.com/2026/09/09/apple-announces-ios-27-release-date/
- Xcode 27 (wtórne źródło cytujące release notes: macOS 26.6+, tylko Apple silicon, Swift 6.4): https://blakecrosley.com/blog/xcode-27-release
- Symulator odbiera zdalne pushe (od Xcode 14, tylko sandbox): https://help.pushwoosh.com/hc/en-us/articles/14811143168157-iOS-Simulator-remote-push-notification-support
- Capacitor 8 i zapowiedź 9: https://ionic.io/blog/?p=6904, https://capacitorjs.com/docs/next/main/reference/support-policy

**Inne:**
- Sesje Supabase (rotacja i ponowne użycie refresh tokenu): https://supabase.com/docs/guides/auth/sessions
- `fetch` i HTTP/2 przez ALPN w Deno: https://docs.deno.com/examples/fetch_data_tutorial/
- Regiony funkcji Vercel (`vercel.json` `regions`, domyślnie iad1): https://vercel.com/docs/functions/configuring-functions/region
- Capacitor, `server.url`: https://github.com/ionic-team/capacitor/blob/main/cli/src/declarations.ts
- Siri i Siri AI w Polsce w iOS 27: https://antyweb.pl/nowa-siri-nie-dla-polaka-ale-ios-27-i-tak-jest-fajny-co-sie-zmieni, https://www.benchmark.pl/nowy-ios-27-juz-na-iphone-ach-najwazniejsza-funkcja-nie-dla-polakow-7329614326343776a, https://antyweb.pl/ios-27-2-trzecia-beta
- Garmin Connect → Apple Zdrowie (źródło wtórne): https://www.sonarhealth.co/en-GB/blog/sync-garmin-with-apple-health/
- Seria Duolingo przez API (nieoficjalne): https://leanrada.com/notes/get-duolingo-streak/
- Fitatu i Apple Zdrowie (do sprawdzenia przez ownera): https://www.fitatu.com/pl/help/czy-jest-mozliwa-synchronizacja-fitatu-z-innymi-urzadzeniami-i-aplikacjami

**Repo:**
- `proxy.ts`, `app/providers.tsx`, `app/layout.tsx`, `lib/data/snapshot.ts`, `lib/domain/{today,nudges,health,model}.ts`, `lib/server/shortcut.ts`
- `features/settings/sections.tsx` (wylogowanie), `features/shell/useAppBadge.ts`, `features/reminders/push.ts`, `features/habits/HabitEditor.tsx`, `features/today/HabitTimer.tsx`
- `supabase/functions/send-reminders/{logic,src}.ts`, `supabase/tests/{assertions,behavior,auth_stub}.sql`, `.github/workflows/ci.yml`
- `supabase/migrations/20261011200033_init.sql`, `20261023120000_health_ingest.sql`, `20261024090000_entry_note_clear.sql`, `20261024120000_health_daily.sql`, `20261024150000_siri_cue_mood.sql`, `20261025090000_audit_fixes.sql`
- `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/preferredRegion.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
