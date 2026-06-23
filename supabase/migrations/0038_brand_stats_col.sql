-- Dashboard "little stats about you": store the creator's platform aggregates
-- (followers, # videos scanned, avg views, avg likes) captured during the handle
-- scan, so the dashboard can show real numbers instead of "Welcome back, <email>".
alter table public.brand_voices add column if not exists stats jsonb;
