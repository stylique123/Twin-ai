-- ONE PRIVATE LIST (owner review 2026-10-05). The shared SENSITIVE list
-- (storyRotation.ts) gains the permit/zoning/landlord terms the 0278 trigger and
-- the answer check each carried separately, and "therapy" needs context
-- ("in therapy", "therapist") so "coffee is my therapy" is not private. The
-- trigger and the voice-profile split are re-created from the same pattern.
-- Rows already private stay private (only towards private, as in 0273).
create or replace function public.creator_knowledge_flag_sensitive()
returns trigger language plpgsql set search_path = public as $fn$
begin
  -- Her choice wins: a fact she confirmed (incl. turning it back on) keeps
  -- whatever she set; the list only ever decides for facts she has not seen.
  if tg_op = 'UPDATE' and new.creator_confirmed_at is not null then
    return new;
  end if;
  new.sensitive := (case when tg_op = 'INSERT' then coalesce(new.sensitive, false) else coalesce(old.sensitive, false) end)
    or coalesce(new.text, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therapist|in therapy|therapy (session|sessions|for|appointment)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school|court (date|dates|hearing|order|case)|went to court|in court|to court|courthouse|courtroom|summons|subpoena\w*|(face|faced|facing|pay|paid|paying|issued|hefty|huge|heavy|daily|steep) fines?|officers?|(the|our|my|visiting) (city |health |code |fire |building |county )?inspectors?|inspectors? (walked|walks|walking|came|comes|showed up|shows up|visited|visits|stopped by|joked|told|said|cited|wrote|shut|is coming|came back|coming back)|inspection officer|surprise inspection|failed (an |my |the |our )?inspection|enforcement|animal control|ticketed|probation|parole|cease and desist|(in|from) (my|our) bank|bank (account|balance)|overdra(ft|wn)\w*|(i|we) (was|were) broke|flat broke|dead broke|couldn'?t (pay|afford) (the |my |our )?(rent|bills?|mortgage)|behind on (my |the |our )?(rent|bills|payments)|permit(s|ting|ted)?|zoning|landlord|licen[cs]e (was |got )?(denied|revoked|suspended)|the city (sent|shut|told|fined|made)|food stamps|payday loans?|credit card debt|my doctor|medical (bills?|debt|leave|condition)|medications?|chemo\w*|emergency room)\M$re$
    or coalesce(new.evidence, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therapist|in therapy|therapy (session|sessions|for|appointment)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school|court (date|dates|hearing|order|case)|went to court|in court|to court|courthouse|courtroom|summons|subpoena\w*|(face|faced|facing|pay|paid|paying|issued|hefty|huge|heavy|daily|steep) fines?|officers?|(the|our|my|visiting) (city |health |code |fire |building |county )?inspectors?|inspectors? (walked|walks|walking|came|comes|showed up|shows up|visited|visits|stopped by|joked|told|said|cited|wrote|shut|is coming|came back|coming back)|inspection officer|surprise inspection|failed (an |my |the |our )?inspection|enforcement|animal control|ticketed|probation|parole|cease and desist|(in|from) (my|our) bank|bank (account|balance)|overdra(ft|wn)\w*|(i|we) (was|were) broke|flat broke|dead broke|couldn'?t (pay|afford) (the |my |our )?(rent|bills?|mortgage)|behind on (my |the |our )?(rent|bills|payments)|permit(s|ting|ted)?|zoning|landlord|licen[cs]e (was |got )?(denied|revoked|suspended)|the city (sent|shut|told|fined|made)|food stamps|payday loans?|credit card debt|my doctor|medical (bills?|debt|leave|condition)|medications?|chemo\w*|emergency room)\M$re$;
  return new;
end $fn$;

update public.creator_knowledge
   set sensitive = true
 where not sensitive
   and (coalesce(text, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therapist|in therapy|therapy (session|sessions|for|appointment)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school|court (date|dates|hearing|order|case)|went to court|in court|to court|courthouse|courtroom|summons|subpoena\w*|(face|faced|facing|pay|paid|paying|issued|hefty|huge|heavy|daily|steep) fines?|officers?|(the|our|my|visiting) (city |health |code |fire |building |county )?inspectors?|inspectors? (walked|walks|walking|came|comes|showed up|shows up|visited|visits|stopped by|joked|told|said|cited|wrote|shut|is coming|came back|coming back)|inspection officer|surprise inspection|failed (an |my |the |our )?inspection|enforcement|animal control|ticketed|probation|parole|cease and desist|(in|from) (my|our) bank|bank (account|balance)|overdra(ft|wn)\w*|(i|we) (was|were) broke|flat broke|dead broke|couldn'?t (pay|afford) (the |my |our )?(rent|bills?|mortgage)|behind on (my |the |our )?(rent|bills|payments)|permit(s|ting|ted)?|zoning|landlord|licen[cs]e (was |got )?(denied|revoked|suspended)|the city (sent|shut|told|fined|made)|food stamps|payday loans?|credit card debt|my doctor|medical (bills?|debt|leave|condition)|medications?|chemo\w*|emergency room)\M$re$ or coalesce(evidence, '') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therapist|in therapy|therapy (session|sessions|for|appointment)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school|court (date|dates|hearing|order|case)|went to court|in court|to court|courthouse|courtroom|summons|subpoena\w*|(face|faced|facing|pay|paid|paying|issued|hefty|huge|heavy|daily|steep) fines?|officers?|(the|our|my|visiting) (city |health |code |fire |building |county )?inspectors?|inspectors? (walked|walks|walking|came|comes|showed up|shows up|visited|visits|stopped by|joked|told|said|cited|wrote|shut|is coming|came back|coming back)|inspection officer|surprise inspection|failed (an |my |the |our )?inspection|enforcement|animal control|ticketed|probation|parole|cease and desist|(in|from) (my|our) bank|bank (account|balance)|overdra(ft|wn)\w*|(i|we) (was|were) broke|flat broke|dead broke|couldn'?t (pay|afford) (the |my |our )?(rent|bills?|mortgage)|behind on (my |the |our )?(rent|bills|payments)|permit(s|ting|ted)?|zoning|landlord|licen[cs]e (was |got )?(denied|revoked|suspended)|the city (sent|shut|told|fined|made)|food stamps|payday loans?|credit card debt|my doctor|medical (bills?|debt|leave|condition)|medications?|chemo\w*|emergency room)\M$re$);

-- A profile with every private list entry moved to private_items.
create or replace function public.brand_voice_private_out(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $fn$
declare
  k text;
  v jsonb;
  e jsonb;
  kept jsonb;
  moved jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return p; end if;
  moved := case when jsonb_typeof(p->'private_items') = 'array' then p->'private_items' else '[]'::jsonb end;
  for k, v in select * from jsonb_each(p) loop
    continue when k = 'private_items' or jsonb_typeof(v) <> 'array';
    kept := '[]'::jsonb;
    for e in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(e) = 'string' and (e #>> '{}') ~* $re$\m(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therapist|in therapy|therapy (session|sessions|for|appointment)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school|court (date|dates|hearing|order|case)|went to court|in court|to court|courthouse|courtroom|summons|subpoena\w*|(face|faced|facing|pay|paid|paying|issued|hefty|huge|heavy|daily|steep) fines?|officers?|(the|our|my|visiting) (city |health |code |fire |building |county )?inspectors?|inspectors? (walked|walks|walking|came|comes|showed up|shows up|visited|visits|stopped by|joked|told|said|cited|wrote|shut|is coming|came back|coming back)|inspection officer|surprise inspection|failed (an |my |the |our )?inspection|enforcement|animal control|ticketed|probation|parole|cease and desist|(in|from) (my|our) bank|bank (account|balance)|overdra(ft|wn)\w*|(i|we) (was|were) broke|flat broke|dead broke|couldn'?t (pay|afford) (the |my |our )?(rent|bills?|mortgage)|behind on (my |the |our )?(rent|bills|payments)|permit(s|ting|ted)?|zoning|landlord|licen[cs]e (was |got )?(denied|revoked|suspended)|the city (sent|shut|told|fined|made)|food stamps|payday loans?|credit card debt|my doctor|medical (bills?|debt|leave|condition)|medications?|chemo\w*|emergency room)\M$re$ then
        moved := moved || jsonb_build_array(e);
      else
        kept := kept || jsonb_build_array(e);
      end if;
    end loop;
    p := jsonb_set(p, array[k], kept);
  end loop;
  if moved <> '[]'::jsonb then p := jsonb_set(p, '{private_items}', moved); end if;
  return p;
end $fn$;

create or replace function public.brand_voices_private_out()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.profile := public.brand_voice_private_out(new.profile);
  return new;
end $fn$;

drop trigger if exists brand_voices_private_out on public.brand_voices;
create trigger brand_voices_private_out before insert or update of profile on public.brand_voices
  for each row execute function public.brand_voices_private_out();

-- Existing voices. The trigger above re-runs the same function; harmless.
update public.brand_voices
   set profile = public.brand_voice_private_out(profile)
 where profile is distinct from public.brand_voice_private_out(profile);
