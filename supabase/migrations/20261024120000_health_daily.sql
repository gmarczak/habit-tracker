-- Prawdziwe wartości z Apple Zdrowie: dzienne sumy każdej przysłanej danej (np. 4312 kroków),
-- także gdy nie osiągnęły progu nawyku. Nawyk tak/nie dalej ma wpis 1, a liczbę bierze stąd.

create table public.health_daily (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric_date date not null,
  metric      text not null check (metric in ('steps', 'distance_km', 'exercise_min', 'active_kcal', 'mindful_min', 'water_ml', 'workouts')),
  value       numeric(10,2) not null check (value >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, metric_date, metric)
);

alter table public.health_daily enable row level security;
-- Tylko odczyt; zapisuje wyłącznie ingest_metrics
create policy own_rows on public.health_daily for select to authenticated using (user_id = (select auth.uid()));

-- ingest_metrics jak dotąd + zapis wszystkich znanych danych do health_daily (suma dnia tylko rośnie)
create or replace function public.ingest_metrics(p_token text, p_metrics jsonb, p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
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

  select ((now() at time zone p.timezone) - make_interval(hours => p.day_start_hour))::date into v_today
  from public.profiles p where p.id = v_uid;
  v_date := coalesce(p_date, v_today);
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
