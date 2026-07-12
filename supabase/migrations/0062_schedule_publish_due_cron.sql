-- Activate scheduled auto-publishing.
--
-- The `social` edge function already implements a `publish_due` runner that posts
-- every scheduled post whose `scheduled_for` has passed — but nothing was calling
-- it, so scheduled posts sat as 'scheduled' forever and silently never went live.
-- This wires pg_cron to ping it every minute. (The runner now claims each post
-- atomically — scheduled → posting → posted/failed — so an overlapping tick can
-- never double-post, and refreshes short-lived tokens before publishing.)
--
-- OPERATOR ONE-TIME SETUP — this migration is a NO-OP until you do BOTH:
--   1. Set CRON_SECRET on the `social` edge function
--        (Dashboard → Edge Functions → social → Secrets), e.g. a long random string.
--   2. Store the SAME value in Vault so the cron can send it as the shared secret:
--        select vault.create_secret('<the-same-secret>', 'cron_secret');
-- Then apply this migration. Until CRON_SECRET is set the runner returns 403 and
-- posts stay scheduled (safe — nothing posts by accident).
--
-- pg_cron + pg_net are already enabled by earlier migrations (0018 / 0031).

select cron.schedule(
  'publish-due',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://jmdecibuytznsonrasxw.supabase.co/functions/v1/social?action=publish_due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
