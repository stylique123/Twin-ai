# Editor v2 — Start Contract (Phase 2)

`start-editor-v2` is the only way an edit begins. Request body is exactly
`{generation_id, source_asset_id, idempotency_key}`; unknown fields are 400.

## Launch gate (fail-closed)

`EDITOR_V2_START_ENABLED` — server environment only, read per request:

| Value | Behavior |
| --- | --- |
| `true` | Normal operation |
| missing / anything else | **503 `editor_not_available`, 0 projects, 0 jobs** |

- Production stays **disabled** until the Phase-3 worker handler exists and a
  controlled rollout begins (cohort/allowlist can be layered on this switch).
  Hiding the UI button is not the control — the server is.
- Staging enables it in the gate workflow (secret set just-in-time, after the
  disabled-state probe runs against the unset default).
- No request field can influence the gate; it is checked before anything else.

## Idempotency-key semantics (exact)

- The key that **creates** a project is stored on the row and permanently
  bound to that project's `(generation, source)`. Reusing it with different
  inputs → 409 `idempotency_key_conflict`, checked at the endpoint and again
  atomically inside `editor_start_project()` under the row lock.
- A **different** key sent while the same source already has an ACTIVE project
  returns that project via **active-source reconciliation**. The alternate key
  is **not stored and not consumed** — it acquired no binding. If the project
  later settles and the same alternate key is sent again with valid inputs, it
  creates a new project and only then becomes bound. Clients must not assume
  every key that ever received a response is bound — only creating keys are.

## Billing boundary (decided now, implemented in Phase 3+)

Phase 2 charges nothing — no editor work runs. The accounting boundary for the
real pipeline is **reserve-and-finalize at the worker**, not at the start
endpoint:

1. **Reserve** when the Phase-3 worker claims the `editor_v2` job — the first
   moment expensive compute is genuinely about to happen.
2. **Finalize** the charge on `completed` (validated output exists).
3. **Release** the reservation on `failed`/`cancelled` — a run that produced
   nothing costs the user nothing.

Rationale: charging at start would bill for jobs a queue outage never ran;
charging only at completion invites free-compute abuse via cancellation. The
reservation is idempotent per project (one reservation per `edit_projects.id`,
reconciled exactly like the job insert), so retries and reclaims can never
double-charge. Free-beta note: while `PAYMENTS_LIVE=false`, reservations
record usage without charging.

## Event history

`edit_events` is DB-enforced append-only: updates always raise; direct deletes
raise; the only deletion path is the FK retention cascade when a project (or
its generation) is deleted. `seq` (identity) gives deterministic event order
independent of timestamp collisions.
