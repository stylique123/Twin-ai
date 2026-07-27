# Track C · Batch A step 1 — DNA contract drift audit

**Authority:** `docs/twinai-selective-transfer-reasoning-contract.md`
(sha256 `3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07`), §2.3 and §11 Batch A.2.
**Audited tree:** exact `main` `42eb0d508f75553df708ae3fcc6753384dfc9d24`.
**Status:** audit only. No type, migration or provider code is changed by this document.

## Why this step exists before `BrandTruthSnapshotV1`

§2.3 asserts a specific defect: the runtime JSON is richer than the shared
`VoiceProfile`, and the two disagree about `editing_style`, `goal`, and brand colors.
A snapshot built on an unverified assertion would freeze the drift instead of
resolving it, so every claim below is checked against the tree and cited.

**Verdict: the assertion is correct on all three fields, and the mechanism differs
per field.** They are not one bug — they are three, and only one of them is a
missing property.

## The two definitions

| | file | lines |
|---|---|---|
| self-reported | `packages/shared/src/types.ts` → `CreatorDNA` | 5–14 |
| synthesized (shared view) | `packages/shared/src/types.ts` → `VoiceProfile` | 33–59 |
| synthesized (runtime, authoritative in practice) | `supabase/functions/_shared/dna.ts` → provider schema | 339–363 |
| runtime REQUIRED-field list | `supabase/functions/_shared/dna.ts` | 365 |
| persistence | `supabase/functions/dna-poll/index.ts` → `brand_voices.profile` | 288 |

The runtime schema — not the TypeScript interface — is what actually reaches the
database. `dna-poll` writes the provider object straight into
`brand_voices.profile` with no projection through `VoiceProfile`, so the shared
interface never constrains the stored shape. That is the root of all three
findings: **the shared type is a description, not a gate.**

## Field-by-field drift

### D1 — `editing_style`: produced and stored, absent from the shared type

- Runtime asks for it: `dna.ts:350` `editing_style: str`.
- `CreatorDNA` has it: `types.ts:12`.
- `VoiceProfile` does **not** — confirmed absent across `types.ts:33–59`.

So the same concept exists in the self-reported contract and in the runtime
output, but the synthesized contract cannot express it. A consumer typed against
`VoiceProfile` silently cannot see a field that is present in the row.

**Not in the runtime REQUIRED list** (`dna.ts:365`), so the provider may omit it
and nothing fails.

### D2 — `brand_colors`: produced, stored, absent from the shared type, and has a second home

- Runtime asks for it: `dna.ts:363` `brand_colors: obj({primary, secondary, highlight}, [])`.
- `VoiceProfile` does **not** declare it.
- `BrandKit` (`types.ts:~66+`) separately carries `palette.primary/secondary/highlight`.
- `dna-poll:288` writes both at once: `.update({ status, profile, stats, error, ...brandKitPatch })`.

This is the most serious of the three: it is not only a missing property but
**two homes for one fact**. `profile.brand_colors` and the brand kit's `palette`
can disagree, and nothing reconciles them. §13 of the contract lists exactly this
shape — "contract drift across web/edge/worker" — as a CI stop rule.

**Also not in the REQUIRED list**, and its own schema default is `[]` (no required
sub-keys), so `{}` is a valid answer.

### D3 — `goal`: present only in the self-reported contract

- `CreatorDNA.goal` exists: `types.ts:9`.
- The runtime schema never asks for it (absent from `dna.ts:339–363`).
- `VoiceProfile` does not declare it.

This is the inverse of D1/D2: not a type that lost a field, but a field with **no
synthesized counterpart at all**. Any downstream reader wanting "the creator's
goal" must fall back to self-reported onboarding data — which is a different
authority level under §5 (user intent, level 2) than synthesized inference
(level 6). Conflating them would let an inferred value occupy a level-2 slot.

## A fourth finding, not in §2.3

**The REQUIRED list is narrower than the schema.** `dna.ts:365` requires 21 fields
and omits `editing_style` and `brand_colors` — the two D1/D2 fields. Combined with
the prompt's "COMPLETENESS IS MANDATORY … a confident, specific inference is far
more useful than a blank" (`dna.ts:381`), the system both *pressures the model to
fill everything* and *declines to enforce the two fields the shared type already
cannot see*. That is the §10.2 hazard ("thin data encouraged to become confident
inference") with no structural backstop.

## What this means for `BrandTruthSnapshotV1`

Consequences that must hold, derived from the findings rather than assumed:

1. The snapshot is built by an explicit **projection** with its own validator.
   Re-typing `VoiceProfile` would not help, because the type is not on the write
   path (`dna-poll:288`).
2. `brand_colors` and `BrandKit.palette` must resolve to **one** field with a
   stated precedence, and the loser must be recorded, not dropped — otherwise D2
   survives inside the snapshot.
3. Every projected field carries provenance (`observed` / `user_asserted` /
   `derived` / `inferred`) per §10.2. D3 shows why the label must be per-field and
   not per-object: `goal` is `user_asserted` while `offer` beside it is `inferred`.
4. Fields the runtime does not require (D1, D2) must be **explicitly optional with
   a recorded absence reason**, never silently defaulted — §7 Step 1 says reject
   missing required business truth rather than invent it.

## Controls this audit obliges Batch A to add

- **Negative:** a stored `brand_voices.profile` carrying `editing_style` and
  `brand_colors` must project into the snapshot without loss; dropping either
  fails the test.
- **Negative:** `profile.brand_colors` disagreeing with `BrandKit.palette` must
  resolve deterministically and record the conflict; silent selection fails.
- **Mutation:** removing the provenance label from one field must make the
  business-fact restriction test fail — proving the label is load-bearing rather
  than decorative.
- **Mutation:** a `goal` value arriving with provenance `inferred` must be
  refused at authority level 2, and the test must fail if that check is removed.
