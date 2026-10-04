-- 0278 — PERMITS AND INSPECTIONS ARE PRIVATE (owner, 2026-10-04).
--
-- The owner's rule: "Private facts (permits, police, hardship) appear only
-- when she has opted that fact in." 0273's word list covers police, officers,
-- inspectors visiting, fines and hardship, but not permitting itself:
-- "Navigated commercial permitting and inspections…" stayed usable and was
-- told in a script about starting a coffee cart. A small second trigger marks
-- permit and inspection facts sensitive on write; she can still turn one on.

create or replace function public.creator_knowledge_permits_are_private()
returns trigger language plpgsql as $$
begin
  if coalesce(new.text, '') ~* $re$\m(permit(s|ting|ted)?|licen[cs]ing process|health (code|department)|inspections?)\M$re$
     or coalesce(new.evidence, '') ~* $re$\m(permit(s|ting|ted)?|inspections?)\M$re$ then
    new.sensitive := true;
  end if;
  return new;
end;
$$;

drop trigger if exists creator_knowledge_permits_are_private on public.creator_knowledge;
create trigger creator_knowledge_permits_are_private
  before insert or update of text, evidence on public.creator_knowledge
  for each row execute function public.creator_knowledge_permits_are_private();

-- Existing rows, unless she already turned one on herself.
update public.creator_knowledge set sensitive = true
 where sensitive is distinct from true
   and creator_confirmed_at is null
   and (coalesce(text, '') ~* $re$\m(permit(s|ting|ted)?|licen[cs]ing process|health (code|department)|inspections?)\M$re$
        or coalesce(evidence, '') ~* $re$\m(permit(s|ting|ted)?|inspections?)\M$re$);
