-- Pory dnia nawyków i nowe rodzaje przypomnień:
--   summary   – wieczorne podsumowanie wszystkiego, co zostało (dotychczasowe z habit_id = null)
--   habit     – jeden nawyk (dotychczasowe z habit_id)
--   morning / day / evening – nawyki z danej pory dnia, które jeszcze czekają
--   yesterday – rano, gdy wczoraj zostało coś niezrobione
--   weekly    – podsumowanie tygodnia w jego ostatnim dniu

alter table public.habits
  add column time_of_day text check (time_of_day in ('morning', 'day', 'evening'));

alter table public.reminders
  add column kind text not null default 'summary'
    check (kind in ('summary', 'habit', 'morning', 'day', 'evening', 'yesterday', 'weekly'));

update public.reminders set kind = 'habit' where habit_id is not null;

alter table public.reminders
  add constraint reminders_kind_habit check ((kind = 'habit') = (habit_id is not null));

-- Jedno przypomnienie każdego rodzaju na użytkownika; dla nawyku jak dotąd: jedno o danej godzinie
alter table public.reminders drop constraint reminders_user_id_habit_id_local_time_key;
create unique index reminders_one_per_kind on public.reminders (user_id, kind) where kind <> 'habit';
create unique index reminders_habit_time on public.reminders (user_id, habit_id, local_time) where kind = 'habit';
