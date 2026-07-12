-- Repair brand voices whose scan STATUS drifted away from their usable PROFILE.
--
-- A voice is usable the moment it carries real profile content (niche/tone/
-- summary). But `status` tracks the last scan job, and a failed *refresh* of an
-- already-built voice ("Refresh voice & stats" hitting an Apify/network hiccup)
-- stamped the row 'failed' while leaving the good profile intact. The creator
-- then saw their DNA in Settings but got "import your brand DNA" on Remix,
-- because generate-blueprint required status='ready'.
--
-- generate-blueprint now gates on profile presence (not status), and dna-poll /
-- the worker no longer downgrade a voice that has a usable profile. This one-time
-- repair makes `status` truthful again for the rows that already drifted, so
-- every status-gated surface (Dashboard, brand switcher, Gallery, Settings'
-- active-voice pick) also treats them as ready.
update public.brand_voices
set status = 'ready', error = null
where status <> 'ready'
  and profile is not null
  and (
    coalesce(profile->>'niche', '')   <> '' or
    coalesce(profile->>'tone', '')    <> '' or
    coalesce(profile->>'summary', '') <> ''
  );
