\set ON_ERROR_STOP 0
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
select count(*) as profiles_auto from profiles;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select user_today() is not null as today_ok;
select add_habit('Czytanie','count','strony','book-open',null,null,'daily',null,null,null,20, current_date - 10) as h1 \gset
select add_habit('Siłownia','check',null,null,null,null,'weekdays','{1,3,5}',null,null,null, current_date - 10) as h2 \gset
\echo '-- poprawny wpis'
select value, skipped from set_entry(:'h1', current_date - 1, 25);
select value from set_entry(:'h1', current_date - 1, 30);   -- upsert, nie duplikat
select count(*) as entries_after_upsert from habit_entries;
\echo '-- oczekiwane bledy:'
select set_entry(:'h1', current_date + 1, 1);       -- przyszlosc
select set_entry(:'h1', current_date - 30, 1);      -- przed startem
insert into habit_plans(habit_id,valid_from,frequency,weekdays) values (:'h2', current_date, 'weekdays', '{0,8}');  -- zle dni
insert into habit_plans(habit_id,valid_from,frequency) values (:'h2', current_date+1, 'weekly_count');  -- brak times_per_week -> blad
insert into habits(name,kind,start_date) values ('X','count',current_date);  -- count bez jednostki
insert into habit_entries(habit_id,entry_date,value,skipped) values (:'h1', current_date-2, 5, true); -- skipped z wartoscia
\echo '-- zmiana planu tworzy nowa wersje, stara zostaje'
select change_plan(:'h2','weekly_count',null,3,null,null);
select change_plan(:'h2','weekly_count',null,4,null,null);  -- drugi raz tego samego dnia: nadpisuje, nie dubluje
select frequency, times_per_week, valid_from = current_date as from_today from habit_plans where habit_id = :'h2' order by valid_from;
\echo '-- RLS: uzytkownik B'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select count(*) as b_sees_habits from habits;
select count(*) as b_sees_entries from habit_entries;
select set_entry(:'h1', current_date, 1);  -- cudzy nawyk -> habit_not_found
insert into habit_entries(habit_id,user_id,entry_date,value) values (:'h1','22222222-2222-2222-2222-222222222222',current_date,1); -- FK zlozony
insert into habit_entries(habit_id,user_id,entry_date,value) values (:'h1','11111111-1111-1111-1111-111111111111',current_date,1); -- RLS with check
update habits set name='hack' where id = :'h1';
reset role;
select name from habits where id = :'h1';
\echo '-- kasowanie konta kaskadowo'
delete from auth.users where email='a@x';
select (select count(*) from habits) h, (select count(*) from habit_entries) e, (select count(*) from habit_plans) p, (select count(*) from profiles) pr;
\echo '-- kolejnosc i usuniecie konta (uzytkownik B)'
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select add_habit('Pierwszy','check',null,'book','blue',null,'daily',null,null,null,null) as b1 \gset
select add_habit('Drugi','check',null,null,null,null,'daily',null,null,null,null) as b2 \gset
select reorder_habits(array[:'b2', :'b1']::uuid[]);
select name, sort_order from habits order by sort_order;
insert into habits(name,kind,start_date,icon) values ('Zla ikona','check',current_date,'Not An Icon!');  -- blad
insert into habits(name,kind,start_date,color) values ('Zly kolor','check',current_date,'pink');  -- blad
\echo '-- przypomnienia: rodzaje i pory dnia'
insert into reminders(kind, local_time) values ('yesterday','09:00'), ('weekly','19:00');
insert into reminders(habit_id, kind, local_time) values (:'b1','habit','08:00');
select kind, habit_id is not null as for_habit from reminders order by kind;
insert into reminders(kind, local_time) values ('weekly','20:00');   -- blad: drugi tygodniowy
insert into reminders(kind, local_time) values ('habit','08:00');    -- blad: habit bez nawyku
update habits set time_of_day = 'noon' where id = :'b1';             -- blad
update habits set time_of_day = 'morning' where id = :'b1';
select time_of_day as b1_part from habits where id = :'b1';
\echo '-- nawyk rzucam i notatki dnia'
select add_habit('Bez slodyczy','check',null,null,null,null,'daily',null,null,null,null) as q1 \gset
update habits set goal = 'quit' where id = :'q1';
select add_habit('Woda','count','szklanek',null,null,null,'daily',null,null,null,8) as q2 \gset
update habits set goal = 'quit' where id = :'q2';                     -- blad: rzucam tylko tak/nie
select goal as q1_goal from habits where id = :'q1';
update habits set goal = 'never' where id = :'q1';                    -- blad
insert into day_notes(note_date, note) values (current_date, 'Spałem 5 godzin');
insert into day_notes(note_date, note) values (current_date, 'drugi');  -- blad: jedna na dzien
insert into day_notes(note_date, note) values (current_date - 1, '   '); -- blad: pusta
select count(*) as b_notes from day_notes;
select delete_my_account();
reset role;
select (select count(*) from auth.users) users_left, (select count(*) from habits) habits_left, (select count(*) from profiles) profiles_left, (select count(*) from day_notes) notes_left;
