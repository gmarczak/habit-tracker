-- Ikony liniowe (decyzja z 11.10.2026), usuwanie konta, kolejność.
-- Bez operacji niszczących: kolumna emoji i funkcja create_habit zostają, ale aplikacja ich nie używa.

alter table public.habits add column icon text check (icon is null or icon ~ '^[a-z0-9-]{1,32}$');
comment on column public.habits.emoji is 'Nieużywane od v2 (zastąpione przez icon). Do usunięcia w przyszłej migracji.';
comment on function public.create_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date)
  is 'Nieużywane od v2 (zastąpione przez add_habit). Do usunięcia w przyszłej migracji.';

alter table public.habits add constraint habits_color_check
  check (color in ('green', 'blue', 'violet', 'amber', 'rose', 'teal', 'slate'));

-- Nawyk + pierwszy plan w jednej transakcji
create function public.add_habit(
  p_name text, p_kind public.habit_kind, p_unit text, p_icon text, p_color text, p_category_id uuid,
  p_frequency public.plan_frequency, p_weekdays int[], p_times_per_week int,
  p_interval_days int, p_target_value numeric, p_start_date date default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_start date := coalesce(p_start_date, public.user_today());
  v_id uuid;
begin
  insert into public.habits (name, kind, unit, icon, color, category_id, start_date, sort_order)
  values (btrim(p_name), p_kind, p_unit, p_icon, coalesce(p_color, 'green'), p_category_id, v_start,
          coalesce((select max(sort_order) + 1 from public.habits where user_id = (select auth.uid())), 0))
  returning id into v_id;

  insert into public.habit_plans (habit_id, valid_from, frequency, weekdays, times_per_week, interval_days, target_value)
  values (v_id, v_start, p_frequency, p_weekdays::smallint[], p_times_per_week, p_interval_days, coalesce(p_target_value, 1));

  return v_id;
end $$;

-- Nowa kolejność nawyków jednym wywołaniem (przeciąganie na liście)
create function public.reorder_habits(p_ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.habits h set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where h.id = o.id and h.user_id = (select auth.uid())
$$;

-- Usunięcie własnego konta: kaskada usuwa profil, nawyki, wpisy, plany, pauzy, przypomnienia, subskrypcje
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function
  public.add_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date),
  public.reorder_habits(uuid[]),
  public.delete_my_account()
from public, anon;
grant execute on function
  public.add_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date),
  public.reorder_habits(uuid[]),
  public.delete_my_account()
to authenticated;
