-- Przypomnienia push: konfiguracja z Vault + harmonogram pg_cron co 5 minut.
-- Sekrety (cron_secret, vapid_*) NIE są w repo: wstawia je jednorazowo skrypt konfiguracyjny
-- (vault.create_secret), patrz README → „Przypomnienia”.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Klucze VAPID dla funkcji Edge, tylko z poprawnym sekretem crona i tylko dla service_role.
create function public.push_config(p_secret text)
returns table (vapid_public text, vapid_private text, vapid_subject text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or p_secret = '' or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return query
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
      (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject');
end $$;

revoke execute on function public.push_config(text) from public, anon, authenticated;
grant execute on function public.push_config(text) to service_role;

-- Co 5 minut: wywołanie funkcji Edge z sekretem z Vault.
select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://fswfdsooabadlcpekiyx.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $cron$
);
