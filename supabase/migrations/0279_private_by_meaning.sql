-- Private by meaning (owner 2026-10-04): a worker model re-reads every fact,
-- across all accounts, and can only mark it private. null = not yet read.
alter table public.creator_knowledge add column if not exists privacy_checked_at timestamptz;
create index if not exists creator_knowledge_privacy_unchecked on public.creator_knowledge (created_at) where privacy_checked_at is null;
