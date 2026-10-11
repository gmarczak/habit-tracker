# Nawyki — habit tracker 2.0

Przepisany od zera tracker nawyków: odhacz w 3 sekundy i zobacz postęp. Plan remasteru i decyzje architektury są w dokumencie „Habit Tracker — plan remasteru” (Claude).

## Stos

- Next.js 16 (App Router) + TypeScript strict, Tailwind CSS v4
- Supabase: Postgres + Auth (link na e-mail) + RLS; projekt `habit-tracker` (eu-central-1)
- TanStack Query z trwałym cache w IndexedDB: odhaczanie bez czekania na sieć, kolejka zmian offline
- Vitest dla logiki domenowej

## Struktura

```
app/                 trasy: / (Dziś), /login, /auth/callback
features/            ekrany i komponenty per funkcja (today, habits, auth)
lib/domain/          czysta logika: daty, harmonogramy, serie, statystyki (+ testy)
lib/data/            pobieranie danych, mutacje, hooki
lib/db/              klienci Supabase i typy wygenerowane z bazy
supabase/migrations  cały schemat bazy
supabase/tests       testy zachowania bazy (RLS, ograniczenia, RPC)
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
```

## Przypomnienia

Web Push wysyła funkcja Edge `send-reminders`. Co 5 minut wywołuje ją `pg_cron` (zadanie `send-reminders`, migracja `reminders_cron`) z nagłówkiem `x-cron-secret`. Funkcja sprawdza sekret przez RPC `push_config`, które przy poprawnym sekrecie zwraca klucze VAPID. Bez sekretu odpowiada `401`.

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

**Klient:** klucz publiczny VAPID jest w zmiennej `NEXT_PUBLIC_VAPID_PUBLIC_KEY` w Vercelu (projekt `gm-habit-tracker`, Production/Preview/Development). Lokalnie wpisz go do `.env.local`. Musi być identyczny z `vapid_public` w Vault.

## Wdrożenie

Produkcja (gm-habit-tracker.vercel.app) wdraża się automatycznie z gałęzi `main` przez integrację Vercel ↔ GitHub; gałęzie i PR-y dostają podglądy. Jeśli push nie uruchamia builda, sprawdź Vercel → Settings → Git (błąd „Project Link not found” naprawia Disconnect + ponowne podłączenie repo).
