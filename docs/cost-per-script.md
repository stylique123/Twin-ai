# What a script costs — per script, per account

Measured 2026-09-26 on production (140 scripts, 17 creators, last 30 days).
Token counts are measured from stored output sizes (≈4 characters per token);
input sizes are estimated from the prompt builders. **Prices are not hard-coded
here** — multiply by the current Gemini price per million tokens for the model
named in `worker/model_routing_v1.json` (`read` = `gemini-3.8-flash`).

> Gap: script generation does not record Gemini `usageMetadata`. Until it does,
> the numbers below are estimates, not a ledger. Logging it is the next step
> that turns this page into a measured bill.

## Per script (when she presses "make my script")

| Step | Gemini calls | Input tokens (est.) | Output tokens (measured) | When |
|---|---|---|---|---|
| Write the script (edge `generate-blueprint`) | 1 (retries only on failure) | ~15,000–25,000 (DNA, product, knowledge, brain block, rules) | ~3,200 (12,756 chars avg blueprint) | Always |
| Niche brain lookup | 1 embedding | ~50 | — | Always, 2.5 s cap, fails open |
| Test viewers | 1 embedding + 1 call | ~3,500 | ~560 (2,241 chars avg) | Always, in the background |
| Questions → brain notes | 1 embedding per new question (~1) | ~30 each | — | Always |

**Script total:** about 3 calls plus 2–3 embeddings, roughly 20–30k input and 4k output tokens.
The test viewers add about 15% to the script's own cost.

## Per account (runs whether or not she makes scripts)

| Job | Calls | How often |
|---|---|---|
| Her panel of test viewers | 1 call (~4k in, ~1.1k out) | Once, then weekly or when she has 5+ new posts |
| Ideas for her | 1 embedding + 1 call (~6k in, ~1.5k out) | Once a day per voice |
| Her own posts read into the brain | 1 call per post (~400 in, ~300 out) | Once per post |
| Sold-out check | 0 Gemini (a plain web fetch) | Rotating |

## Shared (paid once, used by every creator)

| Job | Calls | How often |
|---|---|---|
| Library reader | 1 call + ~6 embeddings per video | Once per video; 7,184 read so far, then only new ones |
| World moments | 1 grounded search per niche bucket | Daily |

## How to turn this into money

`cost = (input_tokens × input_price + output_tokens × output_price) / 1,000,000`

For example, at an input price of `P_in` and output price of `P_out` per million:
- one script ≈ `25k × P_in + 4k × P_out`
- one active creator making 20 scripts a month ≈ `20 × script + 30 × ideas + 4 × panel`

## What drives the cost up
- Longer prompts: the brain block, knowledge and product facts are each capped;
  raising those caps is the biggest cost lever.
- Retries when Gemini fails.
- Re-tests: a script tested before her panel existed is tested once more
  (0237). This is a one-time cost per script.
