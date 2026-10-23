-- Poprawki z przeglądu całej aplikacji:
--   add_habit      – cały nawyk w jednej transakcji (cel, pora dnia, Apple Zdrowie, wyzwalacz) i bez duplikatów:
--                    id nadaje aplikacja, więc powtórzone żądanie po zerwanym połączeniu zwraca ten sam nawyk
--   add_entry      – „+1” i minuty z minutnika dopisywane na serwerze, więc nie nadpisują tego, co w międzyczasie
--                    dodała Siri albo Skrót; id żądania chroni przed podwójnym dopisaniem przy powtórce z kolejki offline
--   log_habit      – dopisanie w jednym upsercie (dwa równoczesne wywołania nie gubią wartości),
--                    początek nazwy porównywany dosłownie (%, _ w nazwie to zwykłe znaki)
--   token_habits   – także id nawyku (dwa nawyki o tej samej nazwie da się rozróżnić)
--   ingest_metrics – Skrót bez daty, który dotarł w pierwszych 15 minutach dnia, uzupełnia dzień, który właśnie minął

-- ============ add_habit ============
drop function public.add_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date);

create function public.add_habit(
  p_name text, p_kind public.habit_kind, p_unit text, p_icon text, p_color text, p_category_id uuid,
  p_frequency public.plan_frequency, p_weekdays int[], p_times_per_week int,
  p_interval_days int, p_target_value numeric, p_start_date date default null,
  p_id uuid default null, p_goal text default 'build', p_time_of_day text default null,
  p_source text default null, p_source_min numeric default null, p_cue text default null, p_why text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_start date := coalesce(p_start_date, public.user_today());
  v_id uuid;
begin
  insert into public.habits (id, name, kind, unit, icon, color, category_id, start_date, sort_order,
                             goal, time_of_day, source, source_min, cue, why)
  values (coalesce(p_id, gen_random_uuid()), btrim(p_name), p_kind, p_unit, p_icon, coalesce(p_color, 'green'), p_category_id, v_start,
          coalesce((select max(sort_order) + 1 from public.habits where user_id = (select auth.uid())), 0),
          coalesce(p_goal, 'build'), p_time_of_day, p_source, p_source_min, nullif(btrim(p_cue), ''), nullif(btrim(p_why), ''))
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    -- to samo żądanie drugi raz: nawyk już jest (RLS: tylko własny)
    select h.id into v_id from public.habits h where h.id = p_id;
    if v_id is null then raise exception 'habit_id_taken' using errcode = '23505'; end if;
    return v_id;
  end if;

  insert into public.habit_plans (habit_id, valid_from, frequency, weekdays, times_per_week, interval_days, target_value)
  values (v_id, v_start, p_frequency, p_weekdays::smallint[], p_times_per_week, p_interval_days, coalesce(p_target_value, 1));

  return v_id;
end $$;

revoke execute on function public.add_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date,
  uuid, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.add_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date,
  uuid, text, text, text, numeric, text, text) to authenticated;

-- ============ add_entry ============
-- Id dopisań już wykonanych (powtórka z kolejki offline nie dopisze drugi raz). Starsze niż 30 dni są usuwane.
create table public.entry_adds (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index entry_adds_user_created_idx on public.entry_adds (user_id, created_at);
alter table public.entry_adds enable row level security;
create policy own_rows on public.entry_adds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.entry_adds from anon;

create function public.add_entry(p_habit_id uuid, p_date date, p_delta numeric, p_request uuid default null) returns public.habit_entries
language plpgsql security invoker set search_path = '' as $$
declare
  v_start date;
  v_row public.habit_entries;
  v_new uuid;
begin
  if p_delta is null or p_delta <= 0 or p_delta > 99999 then raise exception 'bad_value' using errcode = '22023'; end if;
  select start_date into v_start from public.habits where id = p_habit_id;
  if v_start is null then raise exception 'habit_not_found' using errcode = 'P0002'; end if;
  if p_date > public.user_today() then raise exception 'date_in_future' using errcode = '22023'; end if;
  if p_date < v_start then raise exception 'date_before_start' using errcode = '22023'; end if;

  if p_request is not null then
    insert into public.entry_adds (id) values (p_request) on conflict (id) do nothing returning id into v_new;
    if v_new is null then
      -- już dopisane: zwróć stan bez zmian
      select * into v_row from public.habit_entries where habit_id = p_habit_id and entry_date = p_date;
      return v_row;
    end if;
    delete from public.entry_adds where user_id = (select auth.uid()) and created_at < now() - interval '30 days';
  end if;

  insert into public.habit_entries (habit_id, entry_date, value, skipped)
  values (p_habit_id, p_date, p_delta, false)
  on conflict (habit_id, entry_date) do update set
    value = case when public.habit_entries.skipped then 0 else coalesce(public.habit_entries.value, 0) end + excluded.value,
    skipped = false
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.add_entry(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.add_entry(uuid, date, numeric, uuid) to authenticated;

-- ============ token_habits: z id ============
create or replace function public.token_habits(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select o.user_id into v_uid from public.token_owner(p_token) o;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'kind', h.kind, 'unit', h.unit) order by h.sort_order)
    from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
  ), '[]'::jsonb);
end $$;

-- ============ log_habit: dopisanie w upsercie, dosłowny początek nazwy ============
create or replace function public.log_habit(p_token text, p_habit text, p_value numeric default null, p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_today date;
  v_date date;
  v_name text := lower(btrim(coalesce(p_habit, '')));
  v_habit record;
  v_count int;
  v_target numeric;
  v_add numeric;
  v_value numeric;
begin
  select o.user_id, o.today into v_uid, v_today from public.token_owner(p_token) o;
  v_date := coalesce(p_date, v_today);
  if v_date > v_today then raise exception 'date_in_future' using errcode = '22023'; end if;
  if v_date < v_today - 30 then raise exception 'date_too_old' using errcode = '22023'; end if;
  if p_value is not null and (p_value <= 0 or p_value > 99999) then raise exception 'bad_value' using errcode = '22023'; end if;

  select count(*) into v_count from public.habits h
  where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
    and (h.id::text = v_name or lower(h.name) = v_name);
  if v_count = 0 then
    -- Siri bywa niedokładna: jednoznaczny początek nazwy też wystarczy
    select count(*) into v_count from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
      and char_length(v_name) >= 3 and starts_with(lower(h.name), v_name);
    if v_count = 0 then raise exception 'habit_not_found' using errcode = 'P0002'; end if;
    if v_count > 1 then raise exception 'habit_ambiguous' using errcode = '22023'; end if;
    select h.id, h.name, h.kind, h.start_date into v_habit from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build' and starts_with(lower(h.name), v_name);
  else
    if v_count > 1 then raise exception 'habit_ambiguous' using errcode = '22023'; end if;
    select h.id, h.name, h.kind, h.start_date into v_habit from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
      and (h.id::text = v_name or lower(h.name) = v_name);
  end if;
  if v_date < v_habit.start_date then raise exception 'date_before_start' using errcode = '22023'; end if;

  select hp.target_value into v_target from public.habit_plans hp
  where hp.habit_id = v_habit.id and hp.valid_from <= v_date order by hp.valid_from desc limit 1;
  v_target := coalesce(v_target, 1);

  v_add := case v_habit.kind when 'check' then 1 when 'count' then coalesce(p_value, 1) else coalesce(p_value, v_target) end;

  insert into public.habit_entries (habit_id, user_id, entry_date, value, skipped)
  values (v_habit.id, v_uid, v_date, v_add, false)
  on conflict (habit_id, entry_date) do update set
    value = case when v_habit.kind = 'check' then 1
                 else case when public.habit_entries.skipped then 0 else coalesce(public.habit_entries.value, 0) end + excluded.value end,
    skipped = false
  returning value into v_value;

  update public.api_tokens set last_used_at = now() where user_id = v_uid;
  return jsonb_build_object('habit', v_habit.name, 'date', v_date, 'value', v_value, 'target', v_target,
                            'done', case when v_habit.kind = 'check' then true else v_value >= v_target end);
end $$;

-- ============ ingest_metrics: okno 15 minut po początku dnia ============
create or replace function public.ingest_metrics(p_token text, p_metrics jsonb, p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_local timestamp;
  v_today date;
  v_date date;
  v_habit record;
  v_metric text;
  v_value numeric;
  v_out jsonb := '[]'::jsonb;
begin
  select user_id into v_uid from public.api_tokens
  where token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if v_uid is null then raise exception 'invalid_token' using errcode = '28000'; end if;
  if jsonb_typeof(p_metrics) is distinct from 'object' then raise exception 'metrics_not_object' using errcode = '22023'; end if;

  select (now() at time zone p.timezone) - make_interval(hours => p.day_start_hour) into v_local
  from public.profiles p where p.id = v_uid;
  v_today := v_local::date;
  -- Skrót „przed końcem dnia” bywa na serwerze już po północy: sumy są wtedy z dnia, który właśnie minął
  v_date := coalesce(p_date, case when v_local::time < time '00:15' then v_today - 1 else v_today end);
  if v_date > v_today then raise exception 'date_in_future' using errcode = '22023'; end if;
  if v_date < v_today - 30 then raise exception 'date_too_old' using errcode = '22023'; end if;

  foreach v_metric in array array['steps', 'distance_km', 'exercise_min', 'active_kcal', 'mindful_min', 'water_ml', 'workouts'] loop
    if jsonb_typeof(p_metrics -> v_metric) = 'number' then
      v_value := round((p_metrics ->> v_metric)::numeric, 2);
      if v_value >= 0 and v_value <= 99999999 then
        insert into public.health_daily (user_id, metric_date, metric, value)
        values (v_uid, v_date, v_metric, v_value)
        on conflict (user_id, metric_date, metric) do update
          set value = greatest(public.health_daily.value, excluded.value), updated_at = now();
      end if;
    end if;
  end loop;

  for v_habit in
    select h.id, h.name, h.kind, h.source, h.source_min from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.source is not null
      and h.start_date <= v_date and jsonb_typeof(p_metrics -> h.source) = 'number'
    order by h.sort_order
  loop
    v_value := round((p_metrics ->> v_habit.source)::numeric, 2);
    if v_value < 0 or v_value > 99999999 then continue; end if;

    if v_habit.kind = 'check' then
      if v_value >= v_habit.source_min then
        insert into public.habit_entries (habit_id, user_id, entry_date, value)
        values (v_habit.id, v_uid, v_date, 1)
        on conflict (habit_id, entry_date) do nothing;
      end if;
    else
      insert into public.habit_entries (habit_id, user_id, entry_date, value)
      values (v_habit.id, v_uid, v_date, v_value)
      on conflict (habit_id, entry_date) do update set value = greatest(public.habit_entries.value, excluded.value)
      where not public.habit_entries.skipped;
    end if;

    v_out := v_out || jsonb_build_object('habit', v_habit.name, 'source', v_habit.source, 'value', v_value,
                                          'checked', case when v_habit.kind = 'check' then v_value >= v_habit.source_min end);
  end loop;

  update public.api_tokens set last_used_at = now() where user_id = v_uid;
  return jsonb_build_object('date', v_date, 'updated', v_out);
end $$;
