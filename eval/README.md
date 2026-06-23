# Blueprint eval (prompt-change gate)

A tiny, dependency-free harness that runs a fixed **golden set** of reference
videos through the live `generate-blueprint` function and scores each returned
blueprint's structure + basic quality. Run it before/after a prompt change so a
regression (e.g. hooks stop generating, script collapses, caption pack drops) is
caught instead of silently shipping.

## Run

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_ANON_KEY=<anon-key> \
TEST_JWT=<access token for a topped-up test user> \
node eval/run.mjs
```

Exit code is non-zero if the pass rate falls below `threshold` (in
`golden-set.json`, default 0.8) — so it can gate a deploy.

## What it checks (per case, mean of)

- ≥3 hook options
- script ≥ 200 chars
- shot list ≥ 2 setups
- ≥1 caption/publish-plan entry
- a populated `reference_read` (format label or retention map)

## Maintaining the set

Add stable, **public** references across niches to `golden-set.json`. Each run
spends one credit per case on the test account, so keep a dedicated eval user
topped up. This is a structural gate, not an LLM-judge — pair it with spot-checks
when changing tone/voice prompts.
