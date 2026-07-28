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

It is worse than quantisation, too: `EnvWord = [text, startCs, confPct]` carries
**no word END time at all**. The compiler's `CompileWord` requires `endMs`. The
envelope simply does not contain the information needed to cut or caption
accurately — it was never meant to.

**Therefore:** `CompileInput.evidence` is built from the **pinned components**
(full-fidelity ms), never from the envelope. The decision supplies *which* spans
to act on; the components supply *where they are*.

## 2. Index alignment — ALREADY CLOSED, and I was wrong to call it a trap

**Correction.** An earlier draft of this document claimed 8.5 must add an
element-wise parity assertion because `decision.selections` are indices into the
envelope's candidate array and could drift from the pinned component. Reading
`projectSpeechToEnvelope` (`directorContract.ts:322`) shows that is already
enforced, and more strongly than the check I was proposing:

```ts
const candidates: EnvCandidate[] = speech.candidates.map((c, i) => {
  if (c.id !== `c${i}`) fail(`candidate ${i}: positional id mismatch (${c.id})`, 'director_projection_bad_ref')
  ...
```

- it is `.map()`, so the projection is **1:1** — no filtering, no truncation
- over-length **fails closed** (`candidates.length > MAX_CANDIDATES` → raise), it
  does not silently trim
- and each candidate must **carry its own positional id** (`c{i}`, `w{i}`, `u{i}`),
  so a reordering is caught by the data itself rather than by a test that
  remembers to look

Writing a parity test for this would have been building a guard that already
exists, which is worse than no test: it implies the property is fragile and it
would pass for the wrong reason.

**What 8.5 actually owes here** is narrower: the compile adapter must honour the
*same* positional-id convention when it reads candidates back from the pinned
component — resolving by `c{i}` identity, not by trusting array position — so
that it fails the same way for the same reason. Anything looser would be a second
convention for one fact.

## 2b. The two places the centisecond trap is actually reachable

Section 1 is abstract. These are the concrete field-level ways to fall into it,
both found by reading the types rather than by running anything.

**(a) The persisted decision carries centiseconds.**

```ts
export interface DirectorSelection {
  candidateIndex: number; kind: SpeechCandidateKindName
  selectionEnabled: 0 | 1; startCs: number; endCs: number   // <- CENTISECONDS
}
```

An adapter that reached for the span sitting right there on the selection —
`s.startCs * 10` — would compile a plan whose cuts are quantised to 10 ms while
the captions use full-resolution word timings. It reads naturally and it is
wrong.

`startCs`/`endCs` on a selection are a **re-resolution record**: what the server
resolved the model's index to, in the units the model was shown. They are not the
authority on where the cut goes. The adapter must use `candidateIndex` to index
the **pinned component's** candidate array and take `startMs`/`endMs` from there.

**(b) `SpeechWordLike` has no end time — but the component does.**

```ts
export interface SpeechWordLike { id: string; text: string; startMs: number; confidence: number }
```

`CompileWord` requires `endMs`. Typing the adapter against `SpeechWordLike`
because it is the convenient exported interface would make word ends unavailable
and invite reconstructing them from the next word's start — which is wrong across
every pause in the recording.

The **persisted** component is `BuiltWord`, which has `endMs`, and keeps it
unconditionally. Compaction under the 1 MiB payload budget drops only the three
DERIVABLE fields (`normalizedText`, `unitId`, `endsUnit`) and the code says so in
terms worth trusting — *"every word, candidate and timing stays"* — failing LOUD
rather than dropping real evidence if the budget is still exceeded
(`editorSpeech.ts:525-548`).

So the end times are always there. The adapter must type against the component,
not against the envelope's input interface.

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
