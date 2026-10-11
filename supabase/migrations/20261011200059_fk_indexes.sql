-- Indeksy pokrywające złożone klucze obce (zalecenie Supabase advisor)
create index habits_category_fk_idx        on public.habits (category_id, user_id);
create index habit_plans_habit_fk_idx      on public.habit_plans (habit_id, user_id);
create index habit_entries_habit_fk_idx    on public.habit_entries (habit_id, user_id);
create index habit_pauses_habit_fk_idx     on public.habit_pauses (habit_id, user_id);
create index reminders_habit_fk_idx        on public.reminders (habit_id, user_id);
comment on table public.notification_log is 'Tylko service role (Edge Function send-reminders); RLS bez polityk celowo.';
