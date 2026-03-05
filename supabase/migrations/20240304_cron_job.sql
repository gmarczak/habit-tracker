-- This migration sets up pg_cron to call your Supabase Edge Function every hour
-- Make sure to enable the pg_cron extension and http extension if not already enabled.

-- 1. Enable pg_cron (Note: This is often pre-enabled on Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Enable http for calling webhooks directly (if needed) or we use net module
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Schedule the Edge Function to run EVERY HOUR on the hour
-- The Edge Function checks the user's timezone to see if it's 20:00 for them.
-- You must substitute your actual project string in the URL.
SELECT cron.schedule(
  'invoke-remind-habits-hourly',
  '0 * * * *', -- At minute 0 past every hour
  $$
    SELECT net.http_post(
        url:='https://<YOUR_PROJECT_REF>.functions.supabase.co/remind-habits',
        headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <YOUR_ANON_KEY>'
        )
    ) as request_id;
  $$
);

/*
-- To unschedule:
SELECT cron.unschedule('invoke-remind-habits-hourly');
*/
