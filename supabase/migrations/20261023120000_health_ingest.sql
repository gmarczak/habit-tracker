-- Automatyczne wpisy z Apple Zdrowie (Skróty na iPhonie wysyłają dzienne sumy).
--   habits.source      – która dana z Apple Zdrowie wypełnia nawyk (null = tylko ręcznie)
--   habits.source_min  – próg dla nawyku tak/nie (np. 7000 kroków = spacer zaliczony)
--   api_tokens         – osobisty klucz do wysyłania danych; w bazie tylko skrót SHA-256
--   ingest_metrics     – RPC dla roli anon: klucz zamiast sesji, zapis wpisów właściciela klucza

alter table public.habits
  add column source text check (source in ('steps', 'distance_km', 'exercise_min', 'active_kcal', 'mindful_min', 'water_ml', 'workouts')),
  add column source_min numeric(10,2) check (source_min > 0);

alter table public.habits
  add constraint habits_source_build check (source is null or goal = 'build'),
  add constraint habits_source_threshold check (source is null or kind <> 'check' or source_min is not null);

create table public.api_tokens (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash   bytea not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.api_tokens enable row level security;
-- Tylko odczyt (czy klucz jest i kiedy był użyty); tworzenie i usuwanie przez RPC
create policy own_token on public.api_tokens for select to authenticated using (user_id = (select auth.uid()));

-- Nowy klucz (stary przestaje działać). Zwraca jawny klucz jedyny raz.
create function public.new_api_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text := 'ht_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.api_tokens (user_id, token_hash) values (v_uid, sha256(convert_to(v_token, 'UTF8')))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return v_token;
end $$;

create function public.revoke_api_token() returns void
language sql security definer set search_path = '' as $$
  delete from public.api_tokens where user_id = (select auth.uid())
$$;

-- Dzienne sumy z Apple Zdrowie → wpisy nawyków z ustawionym źródłem.
--   tak/nie: wpis, gdy wartość ≥ próg (nigdy nie kasuje ręcznego odhaczenia)
--   ilość/czas: wartość = większa z (dotychczasowa, przysłana) — suma dnia tylko rośnie
-- Pominięte dni (skipped) zostają nietknięte.
create function public.ingest_metrics(p_token text, p_metrics jsonb, p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_today date;
  v_date date;
  v_habit record;
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

revoke execute on function public.new_api_token(), public.revoke_api_token(), public.ingest_metrics(text, jsonb, date) from public, anon, authenticated;
grant execute on function public.new_api_token(), public.revoke_api_token() to authenticated;
grant execute on function public.ingest_metrics(text, jsonb, date) to anon, authenticated;
