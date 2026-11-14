-- FACTS-ONLY WRITER (panel 14; FACTS_ONLY_WRITER, default off, panel and test
-- accounts only). ADDITIVE ONLY: three nullable columns on two existing tables
-- and two indexes. No new table, no new service, nothing dropped or renamed.
-- Files only; applied by hand like the other migrations.
--
-- creator_knowledge is the FACT LEDGER: every fact she said already has an id,
-- a kind, a source and a date. An ANSWER to a question is stored there as a
-- fact (source 'asked', as today) and now also carries the question it
-- answered and the topic it covers (e.g. 'product:<id>:price',
-- 'story:first-kiln-load'), so the writer can match needs by topic.
alter table public.creator_knowledge add column if not exists question_text text;
alter table public.creator_knowledge add column if not exists topic_key text;
create index if not exists creator_knowledge_owner_topic on public.creator_knowledge (owner_id, topic_key) where topic_key is not null;

-- question_asks is the QUESTION HISTORY: every question shown and how it went
-- (answered / skipped). The topic and the request it was asked for make
-- "never ask twice" a lookup: same topic = same question, however worded.
alter table public.question_asks add column if not exists topic_key text;
alter table public.question_asks add column if not exists request_key text;
create index if not exists question_asks_owner_topic on public.question_asks (owner_id, topic_key) where topic_key is not null;
