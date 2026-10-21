# Panel modes harness: Reference mode and Idea mode

Reference mode (remix a video's structure) and Idea mode (the creator's own idea) now have
panel requests that run against the same quality bar as the rest of the fictional panel. Everything in this harness is
fictional: the creators, the ideas, and every reference transcript and structure.

## The requests

`scripts/ops/fixtures/fictional-panel.json`. These were appended after `panel-47`, so earlier indexes are unchanged.

| ids | mode | what is sent to `generate-blueprint` |
| --- | --- | --- |
| panel-48 .. panel-55 | `reference` | `door: 'reference'`, `reference_url` (a made-up `https://example.com/fictional-reference/...`), `reference_use`, `reference_note`, `transcript_id` |
| panel-56 .. panel-63 | `idea` | `door: 'idea'`, the idea text as `reference_note`, an `angle`, no url, no product |

Each of the eight fictional creators has one request of each mode.

### How a reference stays fictional

The edge function never fetches `reference_url`. It reads the reference from the
`transcripts` row named by `transcript_id`, where `owner_id` is the caller. A url with no transcript
gets the 409 `REFERENCE_UNREAD`. In the web app, the worker's `ingest-reference` job writes that row.

The harness skips ingest. Before each Reference-mode request, `panelRun.mjs`
(`storeFictionalReference`) stores the fixture's made-up `reference.text` and `reference.structure`
as the creator's own `transcripts` row:

- `subject: 'reference'`, so the row is never read as the creator's voice.
- `source_url` is the example.com url.
- If a row already exists for that url, the harness reuses it.

The harness then sends that row's id as `transcript_id`. No real post is ever read. `removeFictionalPanel.mjs`
already clears `transcripts` with the accounts.

## Running only these 16

Use the **script-batch** workflow (manual dispatch from main). No workflow edits are needed.
The free-text `group` input carries the mode filter:

| input | value |
| --- | --- |
| label | e.g. `panel-modes-1` (new label = fresh run; same label resumes and skips done rows) |
| limit | `0` |
| group | `panel:reference,panel:idea` |
| panel_file_id | the existing private seeded row id (or leave empty and tick `panel_seed`) |
| panel_seed | `false` if `panel_file_id` is set |
| panel_budget_usd | `1.5` |
| panel_answer_mode | `skip` (or `fixture` to measure question filling) |
| cost_mode | `test` |
| intake | unticked |

Other ways to choose requests:

- `group=panel:reference` runs only the 8 Reference-mode requests.
- `group=panel:idea` runs only the 8 Idea-mode requests.
- To run locally, use `PANEL_MODES=reference,idea` and/or `PANEL_RANGE=48-63`. The range uses the request numbers from the
  `panel-NN` ids and accepts lists like `48,50,60-63`.

```
PANEL_FILE_ID=<row id> PANEL_MODES=reference,idea PANEL_BUDGET_USD=1.5 \
  node scripts/ops/scriptBatch.mjs panel-modes-1 0 --no-intake --group=panel
```

A mode subset keeps each request's fixture index as `n`. As a result, idempotency keys and result rows line up with
full panel runs.

Requests written before this harness have no `mode` and are read as `panel`. `PANEL_MODES=reference,idea`
selects exactly the 16 mode requests.

## Cost

16 requests × ~$0.05 = **~$0.80**. The run logs this estimate at the start. Readiness
re-asks (409) can add a second call to a few requests, so set the budget to `1.5`. The run stops
early once the measured estimate passes it.

## Self-tests

- `node scripts/ops/panelModes.selftest.mjs` covers selection, env/group parsing, body shape, the fictional
  transcript row and the cost figure. `panel.selftest.mjs` also runs it, so the existing CI step covers it.
- `node scripts/ops/panelFixtures.selftest.mjs` checks the following: 8 + 8 mode requests, one of each per creator,
  references marked fictional at example.com, and the first 47 requests unchanged.

## Edge gaps (not changed here)

None block the run. A stored fictional reference already works through `transcript_id`.
Notes for later:

1. The `ingest-reference` path (url to transcript) is not exercised. This harness tests generation from a read
   reference, not reading one.
2. `reference_content_profiles` and `reference_transcripts` have no row for the example.com urls. Any
   visual/assessed-profile enrichment keyed on the url is therefore absent for these requests, as it is for any
   un-assessed real link.
