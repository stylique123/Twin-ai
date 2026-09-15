-- SIX VIDEOS WERE PUBLISHED AND NOTHING WROTE IT DOWN.
--
-- ⚠️ MEASURED ON PRODUCTION 2026-09-14:
--
--   posts rows                                        7
--   posts carrying a generation_id                    7   (6 distinct generations)
--   generation_outcomes rows                         36
--   outcomes whose generation was posted              1
--   was_published answered                            0
--
-- `was_published` has existed since 0191 and NOTHING WRITES IT. `markPosted`
-- records the post in `posts`, and nothing carries that fact across to the
-- outcome row — so Loop B cannot tell a script that was published from one that
-- was never filmed, which are the two ends of its own funnel.
--
-- ⚖️ A TRIGGER ON `posts`, NOT A SECOND CLIENT CALL, AND THE REASON IS IN
-- `recordingFunnel.ts`: minting a second record of an event "would create two
-- answers to one question and guarantee they disagree". The post row already
-- carries `generation_id`, so the answer is derivable from the row alone —
-- which is exactly the condition the gallery rule uses to justify a row
-- trigger. A client that forgets the second call cannot make a published video
-- look unpublished.
--
-- ⚠️⚠️ IT SETS TRUE AND NEVER FALSE, AND THAT IS THE WHOLE CARE HERE. A post
-- proves publication. The ABSENCE of a post proves nothing — she may have
-- posted from the native app, or scheduled it, or posted and never told us.
-- Writing `false` on that absence would put a fabricated negative into the
-- denominator of every question this column is for, and `was_published = false`
-- is precisely the signal the standard calls "the shape didn't work for her".
-- Absent must stay absent.
--
-- ⚠️ AND IT CREATES NO ROW. Five of the six posted generations have no outcome
-- row at all, because outcomes only start at 0191's deploy. Inserting rows here
-- would invent five outcomes whose every other dimension is null — an outcome
-- record for a generation that never had one, which Loop B would then read as
-- real. If there is no row, there is nothing to update, and that is correct.
--
-- ⚖️ AND IT CANNOT COST A CREATOR THEIR POST. An `after insert` trigger that
-- raises aborts the insert, so a failure here would stop her recording that she
-- published — the opposite of the point. Every failure is swallowed and the
-- post stands.

create or replace function public.mark_outcome_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.generation_id is null then
    return new;
  end if;

  begin
    update public.generation_outcomes
       set was_published = true,
           updated_at = now()
     where generation_id = new.generation_id
       -- ⚖️ IDEMPOTENT. Re-posting the same video, or posting it to a second
       -- platform, must not churn the row or move `updated_at` for no reason.
       and was_published is distinct from true;
  exception when others then
    -- ⚠️ THE POST SURVIVES ITS OWN BOOKKEEPING. See the header: aborting here
    -- would lose the creator's record of publishing in order to protect a
    -- derived column.
    null;
  end;

  return new;
end
$fn$;

revoke all on function public.mark_outcome_published() from public;
revoke all on function public.mark_outcome_published() from anon;
revoke all on function public.mark_outcome_published() from authenticated;

drop trigger if exists posts_mark_outcome_published on public.posts;
create trigger posts_mark_outcome_published
  after insert on public.posts
  for each row
  execute function public.mark_outcome_published();

-- ⚠️ THE ONE ROW THAT ALREADY QUALIFIES, backfilled once and stated as one row.
-- Six generations are posted; exactly one of them has an outcome row, so this
-- updates 1. Quoting it as "six" would be counting posts and reporting
-- outcomes.
update public.generation_outcomes o
   set was_published = true,
       updated_at = now()
 where was_published is distinct from true
   and exists (
     select 1 from public.posts p where p.generation_id = o.generation_id
   );

comment on function public.mark_outcome_published() is
  'Carries publication from posts onto the outcome row. Sets TRUE only: the '
  'absence of a post is not evidence she did not publish, and a fabricated '
  'false would poison the one negative signal Loop B has. Creates no row, and '
  'can never fail the insert it hangs off.';
