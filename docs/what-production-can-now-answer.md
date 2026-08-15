# What production can answer, and the exact query for each

Every instrument built in this session writes to a table you can query. This is
the list, with the SQL. Run it against **production**, in the Supabase SQL
editor.

⚠️ **Nothing here returns a row until two things happen:** the migrations are
applied, and scripts are generated. An empty result means "not yet", not "zero" —
those are different answers and the queries below are written so you can tell.

---

## Before anything: are the tables there?

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('script_edits', 'creator_questions_put', 'script_attempts')
order by tablename;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'generations' and column_name = 'selection';
```

Three rows with `rowsecurity = true`, and one column row. Anything less means a
migration did not apply — stop and say which.

---

## 1. How often does script generation fail, and on what?

The question C8 called unanswerable. Before `0129` a failed generation left no
row anywhere; edge logs expire within days.

```sql
select
  count(*) filter (where attempt_index = 0)                              as runs,
  count(*) filter (where outcome = 'failed')                             as failed_attempts,
  count(*) filter (where attempt_index > 0
                     and outcome in ('succeeded','incomplete'))          as served_by_fallback,
  count(*) filter (where generation_id is null and outcome <> 'started') as runs_with_no_script
from public.script_attempts;
```

`served_by_fallback` is the one nothing could answer before: **how often are we
silently serving the second-choice model.**

What it fails on — a code alone sends you to the logs, so the cause is stored:

```sql
select failure_code, count(*), max(left(failure_detail, 120)) as example
from public.script_attempts
where outcome = 'failed'
group by failure_code
order by count(*) desc;
```

Read the codes as actions: `provider_quota` → buy more or slow down.
`provider_unavailable` → wait. `provider_rejected` → **our** request is wrong.
`truncated` → the output cap is too low for the prompt. `unknown` rising →
a failure class we have never seen; read `failure_detail`.

---

## 2. What is the writer actually being handed?

Stored per generation by `0130`. These were six `console.log` counters until
then, so no history exists before it.

```sql
select
  count(*)                                                             as measured,
  round(avg((selection -> 'selection' ->> 'substance')::numeric), 1)   as avg_substance_items,
  round(avg((selection -> 'selection' ->> 'figures')::numeric), 2)     as avg_figures,
  count(*) filter (where (selection -> 'selection' ->> 'starved')::boolean) as starved
from public.generations
where selection is not null;
```

⚖️ **`starved` and a low `available_substance` are different problems.** Starved
means substance existed and did not reach the prompt — the selector's business.
A thin store needs more transcripts or a question, and no selector can fix it:

```sql
select
  (selection -> 'selection' ->> 'available_substance')::int as available,
  (selection -> 'selection' ->> 'substance')::int           as supplied,
  count(*)
from public.generations
where selection is not null
group by 1, 2
order by 1;
```

---

## 3. Is the creator answering questions, and does it reach the writer?

```sql
select outcome, count(*) from public.creator_questions_put group by outcome;

select kind, count(*), max(left(text, 80)) as example
from public.creator_knowledge
where source = 'asked'
group by kind;
```

**The signal that matters is not the first answer — it is the second.** Anyone
answers once out of politeness:

```sql
select owner_id, count(*) as answered
from public.creator_questions_put
where outcome = 'answered'
group by owner_id
order by answered desc;
```

An owner at 1 tried it. An owner at 3+ means the drip works.

---

## 4. What are creators rewriting?

The calibration data every judge and reranker downstream is waiting on.

```sql
select
  count(*)                                              as edits,
  count(*) filter (where (facts ->> 'addedFigure')::boolean)      as added_a_number,
  count(*) filter (where (facts ->> 'addedFirstPerson')::boolean) as made_it_personal,
  count(*) filter (where (facts ->> 'keptShare')::numeric < 0.3)  as rewrote_outright
from public.script_edits;
```

Then read twenty by hand — the pairs are the point, and the facts are only an
index into them:

```sql
select before_text, after_text, facts ->> 'keptShare' as kept
from public.script_edits
order by created_at desc
limit 20;
```

⚠️ **"generic → concrete" is deliberately not stored.** It is the interpretation
everyone wants, and interpretation frozen at capture time cannot be revised when
it turns out wrong. Four metrics broke in one session; each would have been baked
permanently into the data. The pair is kept raw.

---

## 5. What did a transcript cost?

Written into the `build_voice` job result, so no new table.

```sql
select
  result -> 'routes' as routes,
  result ->> 'attempted' as attempted,
  result ->> 'videos_used' as used,
  created_at
from public.jobs
where type = 'build_voice' and result ? 'routes'
order by created_at desc
limit 20;
```

The YouTube question is `youtube_captions_free` against
`youtube_captions_paid` — and among the paid ones, `paid_because_no_captions`
(a fact about YouTube, which caps the budget) versus `paid_because_free_path_failed`
(a bug on our side, which inflates the bill). **Pooling those two would report
our own timeouts as evidence about YouTube.** Roughly twenty scans is enough to
say whether YouTube's budget can go to 25 like TikTok's.

---

## What is still unanswerable, and honestly so

- **Whether any of this makes scripts better.** Every quality instrument in this
  repo is a model judging a model. The panel could not separate arms with
  genuinely different grounding. Only creators choosing can settle it, and the
  system holds 13 real decisions.
- **Why a DNA claim was NOT made.** `dna_claims` has discipline on the output and
  there is no `edit_events` equivalent for the run that produced it. C8 item 3.
- **What a render cost.** VPS compute-seconds and egress are recorded nowhere.
  `costIsComparable` returns false for every project on purpose — a total from
  the cheap half would make every render look affordable.
