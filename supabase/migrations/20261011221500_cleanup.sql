-- Wgrane ręcznie przez SQL Editor 11.10.2026 ok. 22:15 UTC (apply_migration zablokowane), więc nie ma wpisu w supabase_migrations.
-- Porządki po v2: usunięcie nieużywanych kolumny habits.emoji i funkcji create_habit
-- (zastąpione przez icon i add_habit w migracji icons_account) oraz pg_net poza schematem public.

alter table public.habits drop column emoji;

drop function public.create_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date);

-- pg_net nie obsługuje ALTER EXTENSION ... SET SCHEMA; funkcje i tak żyją w schemacie net,
-- więc zadanie crona (net.http_post) działa bez zmian po ponownym utworzeniu.
drop extension if exists pg_net;
create extension pg_net schema extensions;
