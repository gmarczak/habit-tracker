-- 0001_init.sql — Habit Tracker 2.0, schemat bazowy (Supabase / Postgres 15+)

-- ============ TYPY ============
create type public.habit_kind as enum ('check', 'count', 'duration');
create type public.plan_frequency as enum ('daily', 'weekdays', 'weekly_count', 'every_n_days');

-- ============ TABELE ============
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text check (char_length(display_name) <= 60),
  timezone        text not null default 'Europe/Warsaw',
  week_start      smallint not null default 1 check (week_start in (1, 7)),          -- ISO: 1 = poniedziałek
  day_start_hour  smallint not null default 0 check (day_start_hour between 0 and 6), -- dzień kończy się np. o 3:00
  theme           text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  description  text check (char_length(description) <= 500),
  emoji        text check (char_length(emoji) <= 16),
  color        text not null default 'green',
  kind         public.habit_kind not null default 'check',
  unit         text check (char_length(unit) <= 20),           -- wymagana dla 'count'; 'duration' = minuty
  start_date   date not null,
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  check (kind <> 'count' or unit is not null)
);

-- Wersjonowany plan: zmiana harmonogramu/celu nie przepisuje historii
create table public.habit_plans (
  id              uuid primary key default gen_random_uuid(),
  habit_id        uuid not null,
  user_id         uuid not null default auth.uid(),
  valid_from      date not null,
  frequency       public.plan_frequency not null,
  weekdays        smallint[],          -- ISO 1..7, tylko dla 'weekdays'
  times_per_week  smallint,            -- tylko dla 'weekly_count'
  interval_days   smallint,            -- tylko dla 'every_n_days'
  target_value    numeric(10,2) not null default 1 check (target_value > 0),
  created_at      timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  unique (habit_id, valid_from),
  check (
    (frequency = 'daily'        and weekdays is null and times_per_week is null and interval_days is null) or
    (frequency = 'weekdays'     and weekdays is not null and cardinality(weekdays) between 1 and 7
                                and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
                                and times_per_week is null and interval_days is null) or
    (frequency = 'weekly_count' and times_per_week is not null and times_per_week between 1 and 7 and weekdays is null and interval_days is null) or
    (frequency = 'every_n_days' and interval_days is not null and interval_days between 2 and 365 and weekdays is null and times_per_week is null)
  )
);

-- Jeden wpis na nawyk na dzień. Brak wpisu = nie zrobione.
create table public.habit_entries (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null,
  user_id     uuid not null default auth.uid(),
  entry_date  date not null,                         -- dzień lokalny użytkownika, nigdy timestamp
  value       numeric(10,2) check (value >= 0),      -- check: 1; count: ilość; duration: minuty
  skipped     boolean not null default false,        -- świadome pominięcie: nie łamie serii
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  unique (habit_id, entry_date),
  check ((skipped and value is null) or (not skipped and value is not null))
);

-- Pauza/urlop: dni neutralne. habit_id null = wszystkie nawyki.
create table public.habit_pauses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    uuid,
  start_date  date not null,
  end_date    date not null,
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  check (end_date >= start_date)
);

-- habit_id null = wieczorne podsumowanie niezrobionych
create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    uuid,
  local_time  time not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  unique nulls not distinct (user_id, habit_id, local_time)
);

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Idempotencja wysyłki: jedno przypomnienie na dzień lokalny
create table public.notification_log (
  reminder_id  uuid not null references public.reminders (id) on delete cascade,
  local_date   date not null,
  sent_at      timestamptz not null default now(),
  primary key (reminder_id, local_date)
);

-- ============ INDEKSY ============
create index habits_user_active_idx    on public.habits (user_id, sort_order) where archived_at is null;
create index habits_category_idx       on public.habits (category_id);
create index habit_entries_user_date   on public.habit_entries (user_id, entry_date);
create index habit_pauses_user_idx     on public.habit_pauses (user_id, start_date);
create index habit_pauses_habit_idx    on public.habit_pauses (habit_id);
create index reminders_due_idx         on public.reminders (local_time) where enabled;
create index reminders_habit_idx       on public.reminders (habit_id);
create index push_subscriptions_user   on public.push_subscriptions (user_id);

-- ============ TRIGGERY ============
create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger habits_updated_at        before update on public.habits        for each row execute function public.set_updated_at();
create trigger habit_entries_updated_at before update on public.habit_entries for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RLS ============
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.habits             enable row level security;
alter table public.habit_plans        enable row level security;
alter table public.habit_entries      enable row level security;
alter table public.habit_pauses       enable row level security;
alter table public.reminders          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security;  -- bez polityk: tylko service role

create policy own_profile on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy own_rows on public.categories         for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.habits             for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.habit_plans        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.habit_entries      for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.habit_pauses       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.reminders          for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ FUNKCJE (RPC) ============
-- Dzisiejsza data lokalna użytkownika (strefa + godzina końca dnia)
create function public.user_today() returns date
language sql stable security invoker set search_path = '' as $$
  select ((now() at time zone p.timezone) - make_interval(hours => p.day_start_hour))::date
  from public.profiles p where p.id = (select auth.uid())
$$;

-- Nawyk + pierwszy plan w jednej transakcji
create function public.create_habit(
  p_name text, p_kind public.habit_kind, p_unit text, p_emoji text, p_color text, p_category_id uuid,
  p_frequency public.plan_frequency, p_weekdays int[], p_times_per_week int,
  p_interval_days int, p_target_value numeric, p_start_date date default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_start date := coalesce(p_start_date, public.user_today());
  v_id uuid;
begin
  insert into public.habits (name, kind, unit, emoji, color, category_id, start_date, sort_order)
  values (btrim(p_name), p_kind, p_unit, p_emoji, coalesce(p_color, 'green'), p_category_id, v_start,
          coalesce((select max(sort_order) + 1 from public.habits where user_id = (select auth.uid())), 0))
  returning id into v_id;

  insert into public.habit_plans (habit_id, valid_from, frequency, weekdays, times_per_week, interval_days, target_value)
  values (v_id, v_start, p_frequency, p_weekdays::smallint[], p_times_per_week, p_interval_days, coalesce(p_target_value, 1));

  return v_id;
end $$;

-- Zmiana harmonogramu/celu od dziś: przeszłość liczona po staremu
create function public.change_plan(
  p_habit_id uuid, p_frequency public.plan_frequency, p_weekdays int[],
  p_times_per_week int, p_interval_days int, p_target_value numeric
) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_from date := greatest(public.user_today(),
                               (select start_date from public.habits where id = p_habit_id));
begin
  insert into public.habit_plans (habit_id, valid_from, frequency, weekdays, times_per_week, interval_days, target_value)
  values (p_habit_id, v_from, p_frequency, p_weekdays::smallint[], p_times_per_week, p_interval_days, coalesce(p_target_value, 1))
  on conflict (habit_id, valid_from) do update set
    frequency = excluded.frequency, weekdays = excluded.weekdays, times_per_week = excluded.times_per_week,
    interval_days = excluded.interval_days, target_value = excluded.target_value;
end $$;

-- Idempotentny zapis dnia (bezpieczny przy powtórce z kolejki offline)
create function public.set_entry(
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
  values (p_habit_id, p_date, case when p_skipped then null else p_value end, p_skipped, p_note)
  on conflict (habit_id, entry_date) do update set
    value = excluded.value, skipped = excluded.skipped, note = coalesce(excluded.note, public.habit_entries.note)
  returning * into v_row;
  return v_row;
end $$;

-- Usunięcie wpisu = powrót do "nie zrobione"
create function public.clear_entry(p_habit_id uuid, p_date date) returns void
language sql security invoker set search_path = '' as $$
  delete from public.habit_entries where habit_id = p_habit_id and entry_date = p_date
$$;

-- Funkcje tylko dla zalogowanych
revoke execute on function public.user_today(), public.create_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date),
  public.change_plan(uuid, public.plan_frequency, int[], int, int, numeric), public.set_entry(uuid, date, numeric, boolean, text),
  public.clear_entry(uuid, date) from public, anon;
grant execute on function public.user_today(), public.create_habit(text, public.habit_kind, text, text, text, uuid, public.plan_frequency, int[], int, int, numeric, date),
  public.change_plan(uuid, public.plan_frequency, int[], int, int, numeric), public.set_entry(uuid, date, numeric, boolean, text),
  public.clear_entry(uuid, date) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
