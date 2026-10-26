# Nawyki — habit tracker 2.0

Przepisany od zera tracker nawyków: odhacz w 3 sekundy i zobacz postęp. Plan remasteru i decyzje architektury są w dokumencie „Habit Tracker — plan remasteru” (Claude).

## Stos

- Next.js 16 (App Router) + TypeScript strict, Tailwind CSS v4
- Supabase: Postgres + Auth (link na e-mail) + RLS; projekt `habit-tracker` (eu-central-1)
- TanStack Query z trwałym cache w IndexedDB: odhaczanie bez czekania na sieć, kolejka zmian offline
- Vitest dla logiki domenowej

## Struktura

```
app/                 trasy: / (Dziś), /habits, /stats, /settings, /login, /auth/callback, /api/ingest (Skrót z iPhone'a)
features/            ekrany i komponenty per funkcja (today, habits, auth)
lib/domain/          czysta logika: daty, harmonogramy, serie, statystyki (+ testy)
lib/data/            pobieranie danych, mutacje, hooki
lib/db/              klienci Supabase i typy wygenerowane z bazy
supabase/migrations  cały schemat bazy
supabase/tests       behavior.sql (podgląd zachowania) i assertions.sql (asercje: RLS, uprawnienia, RPC — w CI)
```

## Zasady (lekcje ze starej wersji)

- Dzień to data lokalna użytkownika z `lib/domain/dates` (`localDate`) albo `user_today()` w bazie. `toISOString()` na datach jest zabronione przez lint.
- Jeden wpis na nawyk na dzień; zapis tylko przez RPC `set_entry` / `clear_entry` (upsert, bezpieczny przy powtórce offline).
- Serie i statystyki liczy wyłącznie `lib/domain` — UI tylko je wyświetla.
- Zmiana harmonogramu tworzy nową wersję planu (`habit_plans.valid_from`), historia się nie zmienia.
- Bez `alert()` / `confirm()` i bez `any`.

## Uruchomienie

```bash
cp .env.example .env.local   # uzupełnij klucz publishable z Supabase
npm install
npm run dev
```

Sprawdzenia: `npm run check` (typy, lint, testy). Typy bazy: `npm run db:types` (wymaga Supabase CLI).

## Baza

Migracje w `supabase/migrations` są źródłem prawdy. Testy bazy lokalnie (Postgres 15+):

```bash
psql -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do sed '/^create extension/d' "$f" | psql; done
psql -f supabase/tests/behavior.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/assertions.sql
```

## Apple Zdrowie (Garmin, Fitatu…)

Garmin Connect i Fitatu nie mają publicznego API dla osób prywatnych, ale obie zapisują dane do Zdrowia na iPhonie. Skrót (automatyzacja o stałej godzinie) czyta dzienne sumy i wysyła je na `POST /api/ingest`:

```
Authorization: Bearer ht_…          # klucz z Ustawień → Apple Zdrowie
{ "steps": 8234, "water_ml": 1500 }  # opcjonalnie "date": "RRRR-MM-DD"
```

- Klucz tworzy RPC `new_api_token` (w bazie tylko SHA-256 w `api_tokens`), wyłącza `revoke_api_token`.
- Endpoint woła `ingest_metrics` jako `anon`; funkcja sprawdza klucz i zapisuje wpisy nawyków z ustawionym `habits.source`.
- Tak/nie: wpis, gdy wartość ≥ `habits.source_min`. Ilość/czas: największa suma z dnia. Pominięte dni zostają nietknięte.
- Każda przysłana dana trafia też do `health_daily` (suma dnia, tylko rośnie): Dziś pokazuje np. „4312 z 7000 kroków”, szczegóły nawyku — dziś i średnią z 7 dni.
- Dane: `steps`, `distance_km`, `exercise_min`, `active_kcal`, `mindful_min`, `water_ml`, `workouts` (`lib/domain/health.ts`).

## Siri i Skróty

`/api/log` (ten sam klucz co Apple Zdrowie): `GET` zwraca listę nawyków do menu w Skrócie, `POST { "habit": "Medytacja", "value"?: 10 }` odhacza po nazwie (bez wielkości liter, wystarczy jednoznaczny początek). Tak/nie → zrobione, ilość → +value (domyślnie 1), czas → +value minut (domyślnie cel). Odpowiedź ma `message` do odczytania przez Siri. Działa z Action Button, naklejką NFC i Apple Watch (RPC `log_habit`, `token_habits`).

## Przypomnienia

Web Push wysyła funkcja Edge `send-reminders`. Co 5 minut wywołuje ją `pg_cron` (zadanie `send-reminders`, migracja `reminders_cron`) z nagłówkiem `x-cron-secret`. Funkcja sprawdza sekret przez RPC `push_config`, które przy poprawnym sekrecie zwraca klucze VAPID. Bez sekretu odpowiada `401`.

Rodzaje przypomnień (`reminders.kind`, logika w `supabase/functions/send-reminders/logic.ts` i `lib/domain/nudges.ts`):

| Rodzaj | Kiedy wysyła |
| --- | --- |
| `summary` | o ustawionej godzinie, gdy coś zostało na dziś |
| `habit` | jeden nawyk, gdy jeszcze niezrobiony |
| `morning` / `day` / `evening` | nawyki z tej pory dnia (`habits.time_of_day`), które czekają |
| `yesterday` | rano, gdy wczoraj zostały wymagane nawyki bez wpisu; link `/?date=…` otwiera ten dzień |
| `weekly` | w ostatni dzień tygodnia: procent, idealne dni, najlepszy i najsłabszy nawyk, cele tygodniowe |

„Dzień wolny” na ekranie Dziś to jednodniowa pauza wszystkich nawyków (`habit_pauses` z `habit_id = null`): dzień neutralny, serie trwają.

**Sekrety w Supabase Vault** (nigdy w repo):

| Nazwa | Co to jest |
| --- | --- |
| `cron_secret` | losowe ≥ 32 bajty hex; znają go tylko cron i `push_config` |
| `vapid_public` | klucz publiczny VAPID (ten sam co `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) |
| `vapid_private` | klucz prywatny VAPID |
| `vapid_subject` | kontakt dla usług push, np. `mailto:ty@example.com` |

**Konfiguracja od zera** (SQL Editor w Supabase lub `execute_sql`):

```bash
npx web-push generate-vapid-keys --json   # para kluczy VAPID
```

```sql
-- cron_secret losowany w bazie, nigdzie go nie kopiujesz
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret');
select vault.create_secret('<publicKey>', 'vapid_public');
select vault.create_secret('<privateKey>', 'vapid_private');
select vault.create_secret('mailto:<adres>', 'vapid_subject');
```

Zmiana wartości: `select vault.update_secret(id, '<nowa>') from vault.secrets where name = '<nazwa>';`. Po zmianie kluczy VAPID dotychczasowe subskrypcje przestają działać, a użytkownicy muszą włączyć przypomnienia ponownie.

**Wdrożenie funkcji:** kod jest w `supabase/functions/send-reminders/src.ts`, a `index.ts` to wygenerowany bundel.

```bash
npm run build:functions
supabase functions deploy send-reminders --no-verify-jwt --project-ref fswfdsooabadlcpekiyx
```

`--no-verify-jwt` jest celowe, bo autoryzacją jest `x-cron-secret`. Sprawdzenie: `curl -X POST https://fswfdsooabadlcpekiyx.supabase.co/functions/v1/send-reminders` ma zwrócić `401`. Odpowiedzi crona są w `net._http_response`.

**Testowe powiadomienie** (SQL Editor; sekret nie opuszcza bazy):

```sql
select net.http_post(
  url := 'https://fswfdsooabadlcpekiyx.supabase.co/functions/v1/send-reminders',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
  body := jsonb_build_object('test_user_id', (select id::text from auth.users where email = '<adres>'))
);
-- wynik: select status_code, content from net._http_response order by created desc limit 1;
```

W odpowiedzi `results[].status` to kod usługi push (201 = przyjęte; 404/410 = subskrypcja wygasła).

**Klient:** klucz publiczny VAPID jest w zmiennej `NEXT_PUBLIC_VAPID_PUBLIC_KEY` w Vercelu (projekt `gm-habit-tracker`, Production/Preview/Development). Lokalnie wpisz go do `.env.local`. Musi być identyczny z `vapid_public` w Vault.

## Logowanie

Główny sposób to **e-mail + hasło** (`signInWithPassword`, zakładanie konta przez `signUp` z potwierdzeniem adresu). Link z maila (`signInWithOtp`) został jako awaryjny: działa na komputerze i w samym Safari.

Dlaczego hasło: na iPhonie aplikacja dodana do ekranu głównego ma osobną pamięć od Safari, a link z maila zawsze otwiera Safari, więc nie zaloguje aplikacji z ikony. Konto założone linkiem nie ma hasła — ustawia się je w **Ustawieniach → Konto** (`updateUser`).

Wbudowana poczta Supabase wysyła tylko kilka maili na godzinę (błąd 429) i na darmowym planie nie pozwala zmieniać treści maili. Przy większej liczbie użytkowników trzeba podpiąć własny SMTP (Authentication → Emails → SMTP).

**Service worker a sesja.** `public/sw.js` przy instalacji nie pobiera stron aplikacji. Pobieranie kilkunastu stron naraz z ciasteczkami sesji kończyło się w Safari starym tokenem odświeżania; Supabase odrzucał go jako `refresh_token_already_used` („Possible abuse attempt”) i unieważniał całą sesję, czyli wylogowanie. Strony zapisują się do pracy offline przy pierwszej wizycie. Pliki z hashem (`/_next/static`) leżą w cache bez numeru wersji, więc aktualizacja workera nie kasuje plików otwartej strony.

## Awarie w przeglądarce

`app/error.tsx` i `app/global-error.tsx` pokazują ekran „Coś się zacięło” zamiast białej strony Next.js. Gdy nie doczytał się plik aplikacji (`ChunkLoadError`, zwykle po wdrożeniu), strona odświeża się sama, najwyżej raz na minutę. Każda awaria idzie na `POST /api/client-error` (poza `proxy.ts`, bez sesji): do logów Vercela (`[client-error]`, na Hobby żyją godzinę) i do tabeli `client_errors` przez RPC `report_client_error` (limit 60 na godzinę, 30 dni). Podgląd:

```sql
select created_at, kind, url, message, left(stack, 300) from client_errors order by created_at desc limit 20;
```

## Wdrożenie

Produkcja (gm-habit-tracker.vercel.app) wdraża się automatycznie z gałęzi `main` przez integrację Vercel ↔ GitHub; gałęzie i PR-y dostają podglądy. Jeśli push nie uruchamia builda, sprawdź Vercel → Settings → Git (błąd „Project Link not found” naprawia Disconnect + ponowne podłączenie repo).
