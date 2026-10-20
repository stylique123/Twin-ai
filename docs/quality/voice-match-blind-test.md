# Blind voice-match test (design)

Owner rule: a script must sound like the creator who will say it. The generic AI
voice is a bug. This test asks a human whether the scripts we ship can be told
apart by creator, without any label.

This document is a design only. It contains no creator material. The first run
uses the fictional panel (`scripts/ops/fixtures/fictional-panel.json`), whose
voice samples are invented.

## What is being tested

The voice card (`packages/shared/src/script/voice/voiceCard.ts`) is counted from
a creator's own samples: sentence length, signature words (each seen at least
twice), formality, question and exclamation habits, person (I/we/you), and the
generic-AI phrases she never uses. The writer brief carries it and the cleanup
step rewrites lines that use a phrase she never uses. `blueprint.voice_card_id`
and `blueprint.voice_match` (0-100) are recorded on each generation.

The question: does a person, reading scripts with names removed, put each one
with the right creator more often than chance?

## Set-up

1. Pick N creators (start with the 8 fictional panel creators).
2. For each, generate K scripts (K = 5) with the card ON, and K with the card
   OFF (`VOICE_CARD_ENABLED=false`), on the same requests.
3. Strip every identifying cue a rater could match without reading the voice:
   creator, brand and product names, prices, niche nouns that name the product
   category, handles, CTAs. Replace them with neutral placeholders
   (`[PRODUCT]`, `[BRAND]`). Keep only the spoken lines.
4. Shuffle all 2 x N x K scripts with a seeded shuffle; record the seed.
5. Give each rater a "voice sheet" per creator: her 3-5 samples only (the
   material the card was built from), labelled A..H. No tone labels, no
   summaries.

## The rater's task

For each script: choose which voice sheet (A..H) wrote it, and give a
confidence of 1-3. A rater may answer "can't tell". Raters do not see
which arm (card ON or OFF) a script came from, nor the `voice_match` score.

Use at least 3 raters who have not read the fixtures before.

## Scoring

- Accuracy per arm = correct guesses / scripts. Chance is 1/N (12.5% for 8).
- "Can't tell" counts as wrong.
- Primary result: accuracy with card ON minus accuracy with card OFF, with a
  95% interval from a paired bootstrap over scripts.
- Per creator: a confusion matrix. Two creators who are confused with each other
  usually means one card is too thin (few signatures) or both read as generic.
- Agreement between raters: Fleiss' kappa on the chosen sheet.
- Check the automatic score: correlation between `voice_match` and whether
  raters guessed the script right. A score that does not track human
  recognition is not measuring voice.

## Pass bar (first fictional run)

- Card ON accuracy at least 2x chance, and higher than card OFF with the
  interval excluding zero.
- No creator below chance with card ON.
- No script with card ON contains a phrase on its card's `never_uses` list.

## Before any real creator

Real creators stay OFF (kill-switch default) until the fictional run passes.
A real-creator run needs her consent to use her samples as a voice sheet, and
the sheets are shown only to raters bound by the same privacy rules as the
product. No real creator's material is ever added to this document or to a
fixture.

## Panel package: the "sounds like her" sheet

For the next panel package, dump the panel's scripts as `[{ "creator": "<fixture key>", "script": [{ "line": "..." }] }]`
(one row per generation) to a private directory, then:

```
node scripts/ops/voiceBlindTest.mjs --panel=/private/dir/panel.json --n=3 --seed=11 --out=/private/dir/blind
```

Per creator it mixes N panel lines with N of her real sample lines (by default the fictional fixture's
`voice.samples`; pass `--real=/private/dir/real.json`, `{ "<key>": ["..."] }`, for other material), shuffles
every creator onto one sheet (`voice-blind-panel-sheet.csv`: item, creator, text, y/n) and writes the key
(`voice-blind-panel-key.json`) beside it. `--out` must be outside the repository. A creator with fewer than
N lines of either kind is skipped and listed in the key. Score the marked sheet with
`node scripts/ops/voiceBlindTest.mjs --score --key=/private/dir/blind/voice-blind-panel-key.json --marks=<marked.csv>`.
