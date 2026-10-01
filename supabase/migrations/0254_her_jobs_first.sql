-- ⚠️ AUDIT 2026-10-01 (Q1): every job was priority 0, FIFO, one at a time.
-- 119 background reference reads in 24 h sat ahead of a creator: her voice
-- build waited 17 minutes, her own-account sample 18. `claim_job` already
-- orders by priority desc, so this only has to set priority by type.
--
-- ⚖️ ONLY A DEFAULT IS REMAPPED. A job inserted with an explicit priority
-- (the pilot's −20, a paid-plan tier) keeps it.
create or replace function public.jobs_priority_by_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.priority = 0 then
    if new.type in ('editor_v2', 'build_voice', 'scrape_dna', 'sample_own_account',
                    'validate_source', 'validate_clip', 'extract_product', 'ingest') then
      new.priority := 50;   -- something a creator is waiting on
    elsif new.type in ('assess_reference', 'extraction_parity', 'extraction_replication',
                       'remine_knowledge', 'purge_media') then
      new.priority := -10;  -- background: never ahead of her
      -- A background read that failed twice will fail a third time.
      if new.type = 'assess_reference' and new.max_attempts > 2 then
        new.max_attempts := 2;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.jobs_priority_by_type() from public, anon, authenticated;

drop trigger if exists jobs_priority_by_type on public.jobs;
create trigger jobs_priority_by_type
  before insert on public.jobs
  for each row execute function public.jobs_priority_by_type();

-- What is waiting now moves too.
update public.jobs set priority = -10
 where status = 'queued' and priority = 0
   and type in ('assess_reference', 'extraction_parity', 'extraction_replication', 'remine_knowledge', 'purge_media');
update public.jobs set priority = 50
 where status = 'queued' and priority = 0
   and type in ('editor_v2', 'build_voice', 'scrape_dna', 'sample_own_account', 'validate_source', 'validate_clip', 'extract_product', 'ingest');
