-- FACT-SCOPING ARCHITECTURE (owner brief, 2026-09-29). Private facts reached
-- scripts three times, each through a reader the last fix did not know about.
-- This makes the database the first gate: every stored fact carries a
-- `sensitive` flag, set by the same rule the plan screen and the writer use
-- (packages/shared/src/script/privacyGuard.ts — parity-tested), and the writer
-- reads facts ONLY through `creator_knowledge_writable`, which leaves them out.
-- A private fact reaches a script only when she switches it on for that video:
-- the writer then fetches that one row by id, explicitly.
--
-- ⚖️ ADDITIVE: one column (backfilled), one trigger, one view. Nothing deleted.
alter table public.creator_knowledge add column if not exists sensitive boolean not null default false;

create or replace function public.creator_knowledge_flag_sensitive()
returns trigger language plpgsql set search_path = public as $$
begin
  new.sensitive := coalesce(new.text, '') ~* '\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off)\M'
    or coalesce(new.evidence, '') ~* '\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off)\M';
  return new;
end $$;
drop trigger if exists creator_knowledge_flag_sensitive on public.creator_knowledge;
create trigger creator_knowledge_flag_sensitive before insert or update of text, evidence on public.creator_knowledge
  for each row execute function public.creator_knowledge_flag_sensitive();

update public.creator_knowledge
   set sensitive = (coalesce(text, '') ~* '\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off)\M' or coalesce(evidence, '') ~* '\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off)\M')
 where sensitive is distinct from (coalesce(text, '') ~* '\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off)\M' or coalesce(evidence, '') ~* '\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off)\M');

create or replace view public.creator_knowledge_writable
  with (security_invoker = true) as
  select * from public.creator_knowledge where not sensitive;
grant select on public.creator_knowledge_writable to authenticated, service_role;
