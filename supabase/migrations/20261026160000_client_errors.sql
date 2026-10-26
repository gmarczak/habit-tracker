-- Awarie z przeglądarki (ekran „Coś się zacięło” → /api/client-error). Logi Vercela na Hobby żyją godzinę,
-- więc zgłoszenie zostaje tu na 30 dni. Bez danych użytkownika: treść błędu, adres strony, przeglądarka.
create table public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null default 'render' check (kind in ('render', 'chunk')),
  message     text not null check (char_length(message) between 1 and 1000),
  stack       text check (char_length(stack) <= 8000),
  digest      text check (char_length(digest) <= 100),
  url         text check (char_length(url) <= 500),
  user_agent  text check (char_length(user_agent) <= 500)
);
create index client_errors_created_idx on public.client_errors (created_at);
alter table public.client_errors enable row level security;
comment on table public.client_errors is 'Tylko przez report_client_error (security definer); RLS bez polityk celowo.';
revoke all on public.client_errors from anon, authenticated;

-- Wywoływane bez sesji (zgłoszenie ma dojść także, gdy zepsuła się sesja), więc z limitem:
-- najwyżej 60 zgłoszeń na godzinę dla całej bazy, starsze niż 30 dni znikają przy okazji.
create function public.report_client_error(
  p_message    text,
  p_kind       text default 'render',
  p_url        text default null,
  p_user_agent text default null,
  p_stack      text default null,
  p_digest     text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_message), '') = '' then return; end if;
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 60 then return; end if;
  delete from public.client_errors where created_at < now() - interval '30 days';
  insert into public.client_errors (kind, message, stack, digest, url, user_agent)
  values (
    case when p_kind = 'chunk' then 'chunk' else 'render' end,
    left(p_message, 1000), left(p_stack, 8000), left(p_digest, 100), left(p_url, 500), left(p_user_agent, 500)
  );
end $$;

revoke execute on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;
