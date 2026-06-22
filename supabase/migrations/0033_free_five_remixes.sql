-- Panel finding (free + aspiring + skeptic personas, unanimous): 3 free remixes is
-- too thin — users burn them in one excited session and bounce BEFORE the "magic
-- moment" (first auto-edited video) lands. Give free signups enough rope to get
-- hooked: 3 -> 5 remixes (50 credits at VIDEO_COST=10). New signups only; existing
-- balances are left as-is so nobody is shorted or surprised.
alter table public.profiles alter column credits set default 50;
