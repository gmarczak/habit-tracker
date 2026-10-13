-- Nawyki „rzucam” (np. bez słodyczy): dzień bez wpisu = czysto, wpis z wartością 1 = wpadka.
-- Tylko tak/nie; plan dzienny pilnuje aplikacja.
alter table public.habits
  add column goal text not null default 'build' check (goal in ('build', 'quit'));
alter table public.habits
  add constraint habits_quit_is_check check (goal = 'build' or kind = 'check');

-- Notatka do dnia (jedna na dzień), np. „spałem 5 godzin”
create table public.day_notes (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_date   date not null,
  note        text not null check (char_length(btrim(note)) between 1 and 1000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, note_date)
);

alter table public.day_notes enable row level security;
create policy own_rows on public.day_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
