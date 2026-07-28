# Phase 8 Batch 8.5 — wiring the real stages (verified integration notes)

Batch 8.5 turns `compiling` / `rendering` / `validating` from scaffolds into real
work. This document records what was **verified by reading the code**, not
assumed, before any of it is written — because the two defects 8.4 shipped to CI
(a duplicate `edit_plans`, a premature completion trigger) were both the result
of writing first and checking second.

Status: **notes only.** No code in this batch yet.

---

## 1. The trap that would cut the video in the wrong places

`CompileCandidate` wants **milliseconds**:

```ts
export interface CompileCandidate {
  kind: SpeechCandidateKind
  startMs: number
  endMs: number
  ...
}
```

The Director **envelope** encodes **centiseconds**:

```ts
export type EnvVisualWaste = [number, number, number, number]  // startCs, endCs, ...
// editorDirector.ts:94
const startCs = Math.round(Number(iv.startMs) / 10)
```

So the envelope is a **lossy projection built for the model's benefit**. Feeding
it back into the compiler would quantise every cut to 10 ms and put the cuts
slightly out of step with the word timings the captions use — a video that plays,
looks nearly right, and is wrong. No error would be raised anywhere.

> **The envelope is what the model SAW. The pinned components are what the editor
> CUTS.** They are not interchangeable, and nothing in the type system stops you
> confusing them, because both are numbers.

**Therefore:** `CompileInput.evidence` is built from the **pinned components**
(full-fidelity ms), never from the envelope. The decision supplies *which* spans
to act on; the components supply *where they are*.

## 2. …which creates the second trap: index alignment

`decision.selections` is `number[]` — **indices into the envelope's candidate
array**, not identifiers. From `editorDirector.ts:155` the envelope's candidates
are:

```ts
candidates: (speech.candidates as SpeechCandidateLike[]) ?? []
```

taken from the pinned speech component **in order**. So indices align with the
component array *only while that remains true*.

If the envelope projection ever **filters** candidates (rather than truncating a
prefix), index *n* in the decision stops meaning candidate *n* in the component,
and the compiler removes the wrong spans — again silently.

**Required in 8.5, not optional:** a test that builds the envelope and the
compile input from one pinned speech component and asserts the candidate
sequences are **element-wise identical**, plus a mutation control that reorders
or filters one and proves the test fails. Truncation-to-a-prefix is safe and
should be asserted as safe; filtering is not and must fail closed.

## 3. Where the evidence actually comes from

The analyze stage returns **digests only** — not payloads:

```ts
visual: { digest, recorded, cacheHit }   // editorAnalyze.ts:198
```

So the in-memory `analysis` object in `editorV2.ts` cannot feed the compiler. The
components must be **read back by pinned digest**, which is also the correct
design: the compiler should consume the immutable evidence, not in-process state
a crash-resume would not have.

The director already does exactly this and 8.5 reuses it verbatim
(`editorDirector.ts:337-350`):

```ts
const versions = pinned.manifest.manifest.componentVersions
const speech = await loadComponentStrict(asset.id, asset.content_sha256, 'speech', versions.speech)
const digests = pinned.manifest.componentDigests
const [visual, audio, hook] = await Promise.all([
  lookupCached(asset.id, asset.content_sha256, 'visual', digests.visual),
  ...
])
// a missing pinned component is an integrity failure, fail closed
```

## 4. Stage-by-stage

| Stage | Reads | Writes | Notes |
|---|---|---|---|
| `compiling` | pinned components + `edit_director_decisions` row | `editor_record_edit_plan` | pure after the reads |
| `rendering` | plan, source via `VerifiedSourceSession` | `editor_reserve_output` → ffmpeg → `uploadObject` → `editor_mark_output_ready` | needs an ASS file written to the work dir |
| `validating` | produced file | `editor_complete_output` | `validateRenderedOutput` then complete |

`uploadObject(bucket, path, fromFile, contentType)` already exists in
`worker/src/storage.ts:103`. The **path must come from
`editor_reserve_output`** — it is server-derived and the RPC takes no path
argument, so the worker must use what it is handed rather than composing one.

## 5. Gating

Follow the directing precedent exactly (`editorV2.ts:569`):

```ts
} else if (stage === 'directing' && env.editorDirectorEnabled) {
```

- a new `env.editorRenderEnabled`, **default off**
- production keeps the stages simulated until it is set
- `REAL_STAGES` gains the three stages **only when the flag is on**, otherwise the
  `simulated:` marker on every event would start lying
- the `simulated_after_*` boundary moves to after-validating

## 6. What 8.5 must also carry

The **completion trigger deferred from 8.4** (migration `0096`), plus the two
Gate-F assertions currently labelled `KNOWN GAP until 8.5`. Those `ok`s become
`no`s. `check_activation_gate.mjs` will need its premature-constraint rule
updated *deliberately* at that point — which is what its own message asks for,
and it is the correct moment because the renderer then exists.

`scripts/staging-integration/phase8.mjs` lands **after** the wiring, not before.
A staging matrix written against stages that do not execute would pass by not
running anything.
