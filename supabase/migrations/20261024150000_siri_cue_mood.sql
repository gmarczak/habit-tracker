-- Siri i Skróty, wyzwalacz i tożsamość nawyku, nastrój dnia.
--   habits.cue / habits.why   – „po porannej kawie” / „jestem osobą, która czyta” (Atomic Habits)
--   day_notes.mood            – nastrój 1..5; notatka dnia może teraz być samym nastrojem
--   log_habit / token_habits  – odhaczanie z Siri, Action Button, NFC i zegarka (klucz zamiast sesji)

alter table public.habits
  add column cue text check (cue is null or char_length(btrim(cue)) between 1 and 80),
  add column why text check (why is null or char_length(btrim(why)) between 1 and 120);

alter table public.day_notes
  add column mood smallint check (mood between 1 and 5),
  alter column note drop not null,
  drop constraint day_notes_note_check,
  add constraint day_notes_note_check check (note is null or char_length(btrim(note)) between 1 and 1000),
  add constraint day_notes_not_empty check (note is not null or mood is not null);

-- Właściciel klucza i jego dzisiejszy dzień (wspólne dla funkcji Skrótów)
create function public.token_owner(p_token text, out user_id uuid, out today date)
language plpgsql stable security definer set search_path = '' as $$
begin
  select t.user_id, ((now() at time zone p.timezone) - make_interval(hours => p.day_start_hour))::date
  into user_id, today
  from public.api_tokens t join public.profiles p on p.id = t.user_id
  where t.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if user_id is null then raise exception 'invalid_token' using errcode = '28000'; end if;
end $$;

-- Lista aktywnych nawyków „buduję” do menu w Skrócie
create function public.token_habits(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select o.user_id into v_uid from public.token_owner(p_token) o;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', h.name, 'kind', h.kind, 'unit', h.unit) order by h.sort_order)
    from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
  ), '[]'::jsonb);
end $$;

-- Odhaczenie nawyku po nazwie (bez wielkości liter) albo id:
--   tak/nie → zrobione; ilość → dodaje p_value (domyślnie 1); czas → dodaje p_value minut (domyślnie cały cel)
create function public.log_habit(p_token text, p_habit text, p_value numeric default null, p_date date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_today date;
  v_date date;
  v_habit record;
  v_count int;
  v_target numeric;
  v_current numeric;
  v_value numeric;
begin
  select o.user_id, o.today into v_uid, v_today from public.token_owner(p_token) o;
  v_date := coalesce(p_date, v_today);
  if v_date > v_today then raise exception 'date_in_future' using errcode = '22023'; end if;
  if v_date < v_today - 30 then raise exception 'date_too_old' using errcode = '22023'; end if;
  if p_value is not null and (p_value <= 0 or p_value > 99999) then raise exception 'bad_value' using errcode = '22023'; end if;

  select count(*) into v_count from public.habits h
  where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
    and (h.id::text = btrim(p_habit) or lower(h.name) = lower(btrim(p_habit)));
  if v_count = 0 then
    -- Siri bywa niedokładna: jednoznaczny początek nazwy też wystarczy
    select count(*) into v_count from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
      and lower(h.name) like lower(btrim(p_habit)) || '%' and char_length(btrim(p_habit)) >= 3;
    if v_count = 0 then raise exception 'habit_not_found' using errcode = 'P0002'; end if;
    if v_count > 1 then raise exception 'habit_ambiguous' using errcode = '22023'; end if;
    select h.id, h.name, h.kind, h.start_date into v_habit from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build' and lower(h.name) like lower(btrim(p_habit)) || '%';
  else
    if v_count > 1 then raise exception 'habit_ambiguous' using errcode = '22023'; end if;
    select h.id, h.name, h.kind, h.start_date into v_habit from public.habits h
    where h.user_id = v_uid and h.archived_at is null and h.goal = 'build'
      and (h.id::text = btrim(p_habit) or lower(h.name) = lower(btrim(p_habit)));
  end if;
  if v_date < v_habit.start_date then raise exception 'date_before_start' using errcode = '22023'; end if;

  select hp.target_value into v_target from public.habit_plans hp
  where hp.habit_id = v_habit.id and hp.valid_from <= v_date order by hp.valid_from desc limit 1;
  v_target := coalesce(v_target, 1);

  select case when e.skipped then 0 else coalesce(e.value, 0) end into v_current
  from public.habit_entries e where e.habit_id = v_habit.id and e.entry_date = v_date;
  v_current := coalesce(v_current, 0);

  v_value := case v_habit.kind
    when 'check' then 1
    when 'count' then v_current + coalesce(p_value, 1)
    else v_current + coalesce(p_value, v_target)
  end;

  insert into public.habit_entries (habit_id, user_id, entry_date, value, skipped)
  values (v_habit.id, v_uid, v_date, v_value, false)
  on conflict (habit_id, entry_date) do update set value = excluded.value, skipped = false;

  update public.api_tokens set last_used_at = now() where user_id = v_uid;
  return jsonb_build_object('habit', v_habit.name, 'date', v_date, 'value', v_value, 'target', v_target,
                            'done', case when v_habit.kind = 'check' then true else v_value >= v_target end);
end $$;

revoke execute on function public.token_owner(text), public.token_habits(text), public.log_habit(text, text, numeric, date) from public, anon, authenticated;
grant execute on function public.token_habits(text), public.log_habit(text, text, numeric, date) to anon, authenticated;
