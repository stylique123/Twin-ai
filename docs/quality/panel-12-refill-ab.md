# Panel 12: refill A/B (REFILL_V2)

`REFILL_V2` stays DEFAULT OFF in production (wiring ledger row 44). Panel 12
compares two refill arms on test accounts only (the edge honours `refill_arm`
only when `isHeartbeat`):

| Arm | `refill_arm` | What runs |
| --- | --- | --- |
| A | `baseline_p10` | panel-10 refill: no #1303 relevance filter, story-hook dedupe off |
| B | `refill_v2` | arm A + `REFILL_V2` (the only difference) |

## A/B split on the same 24 requests (recommended)

Set the private panel row (the accounts JSON `scripts/ops/panelRun.mjs` reads) to:

```json
{
  "accounts": ["<test account>", "..."],
  "refill_arm": "alternate"
}
```

`alternate` assigns per request, like `ab_split: "alternate"`:
odd `n` (1, 3, ..., 23) gets arm A `baseline_p10`, even `n` (2, 4, ..., 24)
gets arm B `refill_v2`. Each request body carries `refill_arm`, and the stored
scenario and blueprint record it (`refill_arm`). Do NOT add `ab_split` or `arms`
unless you also want the plan_b arm; those keys control `plan_b` and are
independent of `refill_arm`. `PANEL_REFILL_ARM=alternate` in the env does the
same and wins over the row.

## Full A and full B (two batches)

Run the same 24 requests twice: once with `"refill_arm": "baseline_p10"`, once
with `"refill_arm": "refill_v2"` (or `PANEL_REFILL_ARM=baseline_p10` /
`refill_v2`). Every request in a batch then gets that arm.

## Do not

- Set `REFILL_V2=true` on the edge for the panel: that turns v2 on for all
  trial traffic, not just arm B.
- Use any other `refill_arm` value: it is dropped and the edge env decides.

Offline check before the panel: panel-10 replay keeps P10-02/09/19 refills
and blocks P10-01/05/07/20 under v2.
