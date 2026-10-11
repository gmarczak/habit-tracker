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
for f in supabase/migrations/*.sql; do psql -f "$f"; done
psql -f supabase/tests/behavior.sql
```
