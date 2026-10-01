-- ⚠️ AUDIT 2026-10-01 (B1): PRIVATE MATTER WAS DETECTED BY A WORD LIST ONLY.
-- Debt, IVF, "my ex", a child's school, salary, "lost my job" reached the
-- writer. Two changes:
--   1. The list is widened (packages/shared/src/script/storyRotation.ts
--      SENSITIVE — this pattern is generated from it and parity-tested).
--   2. The flag is now an OR: a row the extractor itself marked private stays
--      private even when no listed word appears. The trigger used to OVERWRITE
--      `sensitive` from the word list alone.
create or replace function public.creator_knowledge_flag_sensitive()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.sensitive := (case when tg_op = 'INSERT' then coalesce(new.sensitive, false) else coalesce(old.sensitive, false) end)
    or coalesce(new.text, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school)\M$re$
    or coalesce(new.evidence, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school)\M$re$;
  return new;
end $fn$;

-- Rows the wider list now catches. Only ever sets true: nothing private is unflagged.
update public.creator_knowledge
   set sensitive = true
 where not sensitive
   and (coalesce(text, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school)\M$re$ or coalesce(evidence, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school)\M$re$);
