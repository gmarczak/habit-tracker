-- Testy bazy z asercjami: każdy błąd przerywa skrypt (ON_ERROR_STOP), więc CI robi się czerwone.
-- Uprawnienia jak w Supabase (domyślne granty na tabele z auth_stub.sql), bez dodatkowych grantów na funkcje:
-- sprawdzamy dokładnie to, co nadają i odbierają migracje.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users(id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'test-a@x'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'test-b@x');
-- Dzień użytkownika = current_date serwera (inaczej między 22:00 a 24:00 UTC „dziś” w Warszawie to już jutro)
update profiles set timezone = 'UTC';

-- ---------- użytkownik A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

select set_config('t.read', add_habit('Czytanie', 'count', 'stron', 'book-open', 'blue', null, 'daily', null, null, null, 10, current_date - 10)::text, false);
select set_config('t.walk', add_habit('Spacer', 'check', null, 'footprints', 'green', null, 'daily', null, null, null, null, current_date - 10)::text, false);
select set_config('t.move', add_habit('Ruch', 'duration', null, null, 'green', null, 'daily', null, null, null, 30, current_date - 10)::text, false);

do $$ begin
  -- wpis: upsert zamiast duplikatu
  perform set_entry(current_setting('t.read')::uuid, current_date - 1, 5);
  perform set_entry(current_setting('t.read')::uuid, current_date - 1, 12);
  assert (select count(*) from habit_entries where habit_id = current_setting('t.read')::uuid) = 1, 'upsert dubluje wpis';
  assert (select value from habit_entries where habit_id = current_setting('t.read')::uuid) = 12, 'upsert nie nadpisał wartości';
end $$;

do $$ begin
  -- notatka: null = bez zmian, pusty tekst = usuń
  perform set_entry(current_setting('t.read')::uuid, current_date - 1, 12, false, 'Dobra książka');
  perform set_entry(current_setting('t.read')::uuid, current_date - 1, 13);
  assert (select note from habit_entries where habit_id = current_setting('t.read')::uuid) = 'Dobra książka', 'null skasował notatkę';
  perform set_entry(current_setting('t.read')::uuid, current_date - 1, 13, false, '');
  assert (select note from habit_entries where habit_id = current_setting('t.read')::uuid) is null, 'pusty tekst nie usunął notatki';
end $$;

do $$ begin
  perform set_entry(current_setting('t.read')::uuid, current_date + 1, 1);
  raise exception 'przyszła data przeszła';
exception when sqlstate '22023' then null;
end $$;

do $$ begin
  perform set_entry(current_setting('t.read')::uuid, current_date - 30, 1);
  raise exception 'data przed startem przeszła';
exception when sqlstate '22023' then null;
end $$;

do $$ begin
  update habits set goal = 'quit' where id = current_setting('t.read')::uuid;
  raise exception 'rzucam typu ilość przeszło';
exception when check_violation then null;
end $$;

-- ---------- nowy nawyk w jednej transakcji, bez duplikatu przy powtórce ----------
do $$ declare a uuid; b uuid; begin
  a := add_habit('Bez słodyczy', 'check', null, null, 'rose', null, 'daily', null, null, null, null, current_date - 3,
                 p_id => 'bbbbbbbb-0000-0000-0000-000000000001', p_goal => 'quit', p_time_of_day => 'evening', p_cue => ' po obiedzie ');
  assert (select goal = 'quit' and time_of_day = 'evening' and cue = 'po obiedzie' from habits where id = a),
    'add_habit nie zapisał celu, pory dnia albo wyzwalacza';
  -- ponowny zapis tego samego formularza z poprawioną nazwą: ten sam nawyk, nowe wartości, jeden plan
  b := add_habit('Bez cukru', 'check', null, null, 'rose', null, 'daily', null, null, null, null, current_date - 3,
                 p_id => 'bbbbbbbb-0000-0000-0000-000000000001', p_goal => 'quit');
  assert a = b, 'powtórka add_habit zwróciła inny id';
  assert (select count(*) from habits where name in ('Bez słodyczy', 'Bez cukru')) = 1, 'powtórka add_habit utworzyła duplikat';
  assert (select name from habits where id = a) = 'Bez cukru', 'powtórka add_habit nie zapisała poprawki';
  assert (select count(*) from habit_plans where habit_id = a) = 1, 'powtórka add_habit dodała drugi plan';
end $$;

-- ---------- dopisywanie (+1, minutnik) na serwerze, bez podwójnego dopisania przy powtórce ----------
do $$ declare r habit_entries; begin
  r := add_entry(current_setting('t.read')::uuid, current_date - 2, 3, 'cccccccc-0000-0000-0000-000000000001');
  r := add_entry(current_setting('t.read')::uuid, current_date - 2, 3, 'cccccccc-0000-0000-0000-000000000001');
  assert r.value = 3, 'powtórzone dopisanie policzone dwa razy';
  r := add_entry(current_setting('t.read')::uuid, current_date - 2, 2, 'cccccccc-0000-0000-0000-000000000002');
  assert r.value = 5, 'add_entry nie dodało do wartości';
  perform set_entry(current_setting('t.read')::uuid, current_date - 3, null, true);
  r := add_entry(current_setting('t.read')::uuid, current_date - 3, 4);
  assert r.value = 4 and not r.skipped, 'dopisanie do pominiętego dnia nie zaczęło od zera';
end $$;

do $$ begin
  perform add_entry(current_setting('t.read')::uuid, current_date + 1, 1);
  raise exception 'add_entry z przyszłą datą przeszło';
exception when sqlstate '22023' then null;
end $$;

-- ---------- nastrój dnia, wyzwalacz i tożsamość ----------
insert into day_notes(note_date, mood) values (current_date, 4);
do $$ begin
  insert into day_notes(note_date) values (current_date - 1);
  raise exception 'pusta notatka bez nastroju przeszła';
exception when check_violation then null;
end $$;
do $$ begin
  insert into day_notes(note_date, mood) values (current_date - 2, 6);
  raise exception 'nastrój 6 przeszedł';
exception when check_violation then null;
end $$;
update habits set cue = 'po porannej kawie', why = 'jestem osobą, która czyta' where id = current_setting('t.read')::uuid;

-- ---------- Apple Zdrowie ----------
do $$ begin
  update habits set source = 'steps' where id = current_setting('t.walk')::uuid;
  raise exception 'tak/nie bez progu przeszło';
exception when check_violation then null;
end $$;

update habits set source = 'steps', source_min = 7000 where id = current_setting('t.walk')::uuid;
update habits set source = 'exercise_min' where id = current_setting('t.move')::uuid;
select set_config('t.token', new_api_token(), false);

do $$ begin
  assert current_setting('t.token') like 'ht\_%', 'zły format klucza';
  assert (select count(*) from api_tokens) = 1, 'brak klucza';
  assert (select token_hash from api_tokens) = sha256(convert_to(current_setting('t.token'), 'UTF8')), 'klucz nie jest zapisany jako SHA-256';
end $$;

reset role;
set role anon;

do $$ declare r jsonb; begin
  -- z datą: bez niej wysyłka w pierwszych 15 minutach dnia trafia do wczoraj (test nie zależy od godziny)
  r := ingest_metrics(current_setting('t.token'), '{"steps": 5000, "exercise_min": 12}', current_date);
  r := ingest_metrics(current_setting('t.token'), '{"steps": 8200, "exercise_min": 9}', current_date);
  assert jsonb_array_length(r -> 'updated') = 2, 'ingest nie zwrócił obu nawyków';
end $$;

do $$ begin
  perform ingest_metrics('ht_zly', '{"steps": 9000}');
  raise exception 'zły klucz przeszedł';
exception when sqlstate '28000' then null;
end $$;

do $$ begin
  perform ingest_metrics(current_setting('t.token'), '{"steps": 9000}', current_date + 1);
  raise exception 'ingest z przyszłą datą przeszedł';
exception when sqlstate '22023' then null;
end $$;

-- Siri i Skróty: odhaczanie po nazwie
do $$ declare r jsonb; begin
  assert jsonb_array_length(token_habits(current_setting('t.token'))) = 3, 'token_habits: zła lista';
  assert (token_habits(current_setting('t.token')) -> 0 ->> 'id') = current_setting('t.read'), 'token_habits bez id';
  r := log_habit(current_setting('t.token'), 'czytanie', 5);
  assert (r ->> 'value')::numeric = 5 and not (r ->> 'done')::boolean, 'ilość: +5';
  r := log_habit(current_setting('t.token'), '  CZYTANIE ', 5);
  assert (r ->> 'value')::numeric = 10 and (r ->> 'done')::boolean, 'ilość: suma do celu';
  r := log_habit(current_setting('t.token'), 'Ruch');
  assert (r ->> 'value')::numeric = 42, 'czas: domyślnie cały cel dodany do 12 z Apple Zdrowie';
end $$;

do $$ begin
  perform log_habit(current_setting('t.token'), 'xyz');
  raise exception 'nieznany nawyk przeszedł';
exception when sqlstate 'P0002' then null;
end $$;

do $$ begin
  -- „_” i „%” to zwykłe znaki, nie wzorzec LIKE
  perform log_habit(current_setting('t.token'), 'C_y');
  raise exception 'log_habit potraktował _ jak dowolny znak';
exception when sqlstate 'P0002' then null;
end $$;

do $$ declare r jsonb; begin
  r := log_habit(current_setting('t.token'), current_setting('t.read'), 1);
  assert (r ->> 'habit') = 'Czytanie' and (r ->> 'value')::numeric = 11, 'log_habit po id';
end $$;

do $$ begin
  perform log_habit('ht_zly', 'Czytanie');
  raise exception 'log_habit ze złym kluczem przeszedł';
exception when sqlstate '28000' then null;
end $$;

do $$ begin
  perform token_owner(current_setting('t.token'));
  raise exception 'anon wywołał token_owner';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform set_entry(current_setting('t.read')::uuid, current_date, 1);
  raise exception 'anon wywołał set_entry';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform new_api_token();
  raise exception 'anon utworzył klucz';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform add_entry(current_setting('t.read')::uuid, current_date, 1);
  raise exception 'anon wywołał add_entry';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  assert (select count(*) from habit_entries) = 0, 'anon widzi wpisy';
  assert (select count(*) from api_tokens) = 0, 'anon widzi klucze';
  assert (select count(*) from health_daily) = 0, 'anon widzi dane zdrowotne';
end $$;

reset role;

do $$ begin
  assert (select value from habit_entries where habit_id = current_setting('t.walk')::uuid and entry_date = current_date) = 1,
    'spacer nie odhaczony po przekroczeniu progu';
  -- 12 z Apple Zdrowie (maksimum z 12 i 9) + 30 z log_habit
  assert (select value from habit_entries where habit_id = current_setting('t.move')::uuid and entry_date = current_date) = 42,
    'ilość/czas nie wzięła maksimum dnia';
  assert (select last_used_at is not null from api_tokens), 'klucz bez daty użycia';
  -- prawdziwe wartości: kroki zapisane także poniżej progu, suma dnia tylko rośnie
  assert (select value from health_daily where metric = 'steps' and metric_date = current_date) = 8200, 'brak kroków w health_daily';
  assert (select value from health_daily where metric = 'exercise_min' and metric_date = current_date) = 12, 'health_daily nie wzięło maksimum';
end $$;

-- ---------- izolacja (RLS): użytkownik B ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false);

do $$ begin
  assert (select count(*) from habits) = 0, 'B widzi nawyki A';
  assert (select count(*) from habit_entries) = 0, 'B widzi wpisy A';
  assert (select count(*) from api_tokens) = 0, 'B widzi klucz A';
  assert (select count(*) from health_daily) = 0, 'B widzi dane zdrowotne A';
  update habits set name = 'hack' where id = current_setting('t.read')::uuid;
end $$;

do $$ begin
  perform set_entry(current_setting('t.read')::uuid, current_date, 1);
  raise exception 'B zapisał wpis w nawyku A';
exception when sqlstate 'P0002' then null;
end $$;

do $$ begin
  insert into habit_entries(habit_id, user_id, entry_date, value)
  values (current_setting('t.read')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001', current_date, 1);
  raise exception 'B wstawił wpis jako A';
exception when insufficient_privilege then null;
end $$;

reset role;

do $$ begin
  assert (select name from habits where id = current_setting('t.read')::uuid) = 'Czytanie', 'B zmienił nazwę nawyku A';
end $$;

-- ---------- usunięcie konta kaskadą ----------
delete from auth.users where email in ('test-a@x', 'test-b@x');
do $$ begin
  assert (select count(*) from habits) = 0 and (select count(*) from habit_entries) = 0 and (select count(*) from api_tokens) = 0
    and (select count(*) from health_daily) = 0 and (select count(*) from entry_adds) = 0,
    'usunięcie konta zostawiło dane';
end $$;

\echo 'assertions: OK'
