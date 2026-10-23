-- set_entry: pusty tekst w p_note usuwa notatkę wpisu (null nadal = zostaw dotychczasową).
-- Wcześniej notatki nie dało się skasować: coalesce przywracał starą.
create or replace function public.set_entry(
  p_habit_id uuid, p_date date, p_value numeric, p_skipped boolean default false, p_note text default null
) returns public.habit_entries
language plpgsql security invoker set search_path = '' as $$
declare
  v_start date;
  v_row public.habit_entries;
begin
  select start_date into v_start from public.habits where id = p_habit_id;
  if v_start is null then raise exception 'habit_not_found' using errcode = 'P0002'; end if;
  if p_date > public.user_today() then raise exception 'date_in_future' using errcode = '22023'; end if;
  if p_date < v_start then raise exception 'date_before_start' using errcode = '22023'; end if;

  insert into public.habit_entries (habit_id, entry_date, value, skipped, note)
  values (p_habit_id, p_date, case when p_skipped then null else p_value end, p_skipped, nullif(btrim(p_note), ''))
  on conflict (habit_id, entry_date) do update set
    value = excluded.value, skipped = excluded.skipped,
    note = case when p_note is null then public.habit_entries.note else excluded.note end
  returning * into v_row;
  return v_row;
end $$;
