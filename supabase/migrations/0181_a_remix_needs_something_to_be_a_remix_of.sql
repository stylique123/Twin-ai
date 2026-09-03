-- A RATE NEEDS A DENOMINATOR, AND `remixes` NEVER HAD ONE.
--
-- ⚠️ `user_case_study` has counted `gallery_remix` since 0027. Nothing has ever
-- counted how many references a creator OPENED. So a reference with zero remixes
-- was indistinguishable from a reference nobody was shown -- and those two facts
-- support opposite conclusions. "Creators reject this format" and "this card is
-- on page three" read identically in the data we had.
--
-- ⚖️ `opens` COMES FROM `gallery_opened`, ADDED IN THE SAME CHANGE AS THIS
-- MIGRATION. Before it, this number is legitimately 0 for every historic row --
-- not because nobody looked, but because nobody was counting. A rate computed
-- across that boundary would be a fabrication, which is why the rate below
-- refuses rather than divides.
--
-- ⚠️ NULL, NOT ZERO, WHEN THERE IS NO DENOMINATOR. `remix_rate` is null when
-- `opens` is 0. A creator who has opened nothing has not "converted at 0%" --
-- they have not been measured, and a dashboard showing 0% would report a
-- product failure that did not happen. This is the same rule 0180 applies to
-- Tier 0 and the same rule the ledger states as "absent is not zero".
--
-- Idempotent by construction: `create or replace`, same signature, same grants.

create or replace function public.user_case_study(p_user uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'blueprints',  count(*) filter (where event = 'blueprint_generated'),
    'edits',       count(*) filter (where event = 'edit_rendered'),
    'posts',       count(*) filter (where event = 'post_logged'),
    'voices',      count(*) filter (where event = 'voice_built'),
    'remixes',     count(*) filter (where event = 'gallery_remix'),
    -- The denominator. Logged from the gallery detail open, which is the
    -- cheapest act that means "I am considering this one".
    'opens',       count(*) filter (where event = 'gallery_opened'),
    -- ⚠️ THE NULL CHECK PRECEDES THE DIVISION. Never 0/0, and never a rate
    -- presented for a creator who has not been measured.
    'remix_rate',  case
                     when count(*) filter (where event = 'gallery_opened') = 0 then null
                     else round(
                       count(*) filter (where event = 'gallery_remix')::numeric
                       / count(*) filter (where event = 'gallery_opened'), 3)
                   end,
    'hours_saved', round(coalesce(sum(time_saved_minutes), 0) / 60.0, 1),
    'first_seen',  min(created_at),
    'last_seen',   max(created_at),
    'active_days', count(distinct ((created_at at time zone 'UTC')::date))
  )
  from public.analytics_events where user_id = p_user;
$$;

revoke all on function public.user_case_study(uuid) from public, anon, authenticated;
grant execute on function public.user_case_study(uuid) to service_role;
