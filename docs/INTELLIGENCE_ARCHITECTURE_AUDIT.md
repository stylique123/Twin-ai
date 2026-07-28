# Twin — Intelligence Architecture Audit

> **What this is.** A reverse-engineered, implementation-traced account of how Twin
> actually thinks, from the moment a user provides a reference to the final edit.
> Every claim below is traced to a file. Where something is missing, partial, or
> only aspirational, it is marked explicitly.
>
> **Method.** Read of `supabase/functions/*`, `worker/src/*`, `packages/shared/src/*`,
> `apps/web/src/pages/v2/*`, `supabase/migrations/*` at commit `42eb0d5`. No
> assumptions carried over from `ARCHITECTURE.md` / `ROADMAP.md` — where docs and code
> disagree, the code wins and the disagreement is noted.
>
> **The single most important finding, stated up front:**
> Twin today is **two disconnected intelligences**. A *writing* intelligence (reference
> → blueprint → recording plan) that is genuinely reference-driven, and an *editing*
> intelligence (take → evidence → Director decision) that **has never heard of the
> reference**. The reference's influence ends the moment the creator hits record. And
> the editing intelligence does not currently produce a video: `compiling`, `rendering`
> and `validating` are simulated stages that write a text file and sleep.

---

## Part 0. The honest status table (read this before anything else)

| Stage | Status in code | Evidence |
|---|---|---|
| Creator DNA scan + synthesis | **REAL** | `supabase/functions/_shared/dna.ts`, `start-dna`, `dna-poll`, `worker/src/jobs/scrapeDna.ts`, `voice.ts` |
| Reference ingest + transcription | **REAL** | `worker/src/jobs/transcribe.ts`, `worker/src/media.ts` |
| Reference structure derivation | **REAL, audio-only** | `worker/src/structure.ts` |
| Blueprint generation | **REAL** | `supabase/functions/generate-blueprint/index.ts` |
| Blueprint → Recording Script | **REAL, deterministic, no AI** | `packages/shared/src/recordingScriptAdapter.ts` |
| Capture (record against script) | **REAL** | `apps/web/src/pages/v2/V2Capture.tsx`, `packages/shared/src/editor/capture.ts` |
| Editor `inspecting` | **REAL** | `worker/src/jobs/editorInspect.ts` |
| Editor `transcribing` | **REAL** | `worker/src/jobs/editorSpeech.ts` |
| Editor `analyzing` (visual/audio/hook) | **REAL** | `editorVisual.ts`, `editorAudio.ts`, `editorHook.ts` |
| Editor `directing` | **REAL but flag-gated OFF in prod** | `editorDirector.ts`; `env.editorDirectorEnabled` = `EDITOR_DIRECTOR_ENABLED === 'true'` |
| Editor `compiling` | **SIMULATED** | `editorV2.ts` → `runSimulatedStage()` writes `compiling.txt`, sleeps |
| Editor `rendering` | **SIMULATED** | same |
| Editor `validating` | **SIMULATED** | same |
| Final video output | **DOES NOT EXIST** | `finishProject(..., 'completed', ...)` sets `simulated_after_analysis: true`; `edit_projects.output_asset_id` stays `NULL` (`0078_editor_projects.sql`, `0088_editor_director.sql`) |
| Knowledge layer (website/catalogue/docs/reviews) | **DOES NOT EXIST** | no code path anywhere fetches a user URL other than the reference |
| Explicit intent model | **DOES NOT EXIST** | closest proxies are two 3-way enums, `fidelity` + `tone` |
| Multi-reference blending | **DOES NOT EXIST** | one `reference_url` per `generations` row |
| Idea generation ("5 video ideas") | **DOES NOT EXIST** | no endpoint, no UI |
| B-roll / stock asset sourcing | **DOES NOT EXIST** | Pexels/Pixabay appear only in `ROADMAP.md`, never in code |
| Image generation | **PARTIAL — thumbnail only** | `supabase/functions/generate-thumbnail/index.ts` |

Also note: the editor's public entrypoint is itself gated —
`start-editor-v2/index.ts:54` refuses unless `EDITOR_V2_START_ENABLED === 'true'`.

---

## Part 1. Complete system flow — the real pipeline

```
[creator handle]                       [reference URL or typed idea]
      │                                             │
      ▼                                             ▼
 start-dna ──► Apify actor run             ingest-reference (edge)
      │        (20 posts, per platform)      │  SSRF allow-list: tiktok/ig/yt, https only
      ▼                                      │  clone_cached_transcript(url_key) → cache hit skips everything
 dna-poll ──► synthesizeVoice()              ▼
      │        Gemini 3.1-pro-preview      jobs.ingest
      │        (fb 2.5-flash) + vision      │
      ▼        on ≤4 post images            ▼
 brand_voices.profile  ◄─────────────  worker transcribe.ts
 brand_voices.brand_kit.palette          │  yt-dlp audio-only ▸ faster-whisper
 profiles.dna (quiz fallback)            │  or YouTube captions / Apify IG transcript
      │                                   ▼
      │                             deriveStructure()  Gemini env.fastModel
      │                                   │  → 6 fields, from TRANSCRIPT ONLY
      │                                   ▼
      │                             transcripts{text, words, segments, structure}
      │                                   │
      └───────────────┬───────────────────┘
                      ▼
        generate-blueprint (edge, Gemini 2.5-flash, temp 0.8, 32k out)
        ONE prompt = CREATOR DNA block + REFERENCE block + FIDELITY rule + TONE rule
                      │  spend_credits(10) before the call, refund on any throw
                      ▼
        generations.blueprint  (12 required top-level objects — see Part 7)
                      │
                      ▼
        buildRecordingScript()   ← PURE TypeScript, zero AI, runs in the browser
                      │  hook → scene 1; script beats → talking scenes;
                      │  shot_list b-roll hints → ≤3 silent insert scenes; CTA scene
                      ▼
        generations.scene_timeline  (RecordingScript v1)
                      │
                      ▼
        V2Capture — teleprompter, scene-by-scene record
                      │  writes source_capture_intents (origin, recording_script_sha256)
                      │  + source_capture_manifests + source_script_snapshots
                      ▼
        media_assets (take)  ──►  jobs.validate_source  ──► status: ready
                      │
                      ▼
        start-editor-v2 (edge, flag-gated) ──► edit_projects + jobs.editor_v2
                      ▼
        worker editorV2.ts
          pin Boot Manifest (component versions, model artifacts, ffmpeg banner,
             rules SHA, capture-manifest SHA, FROZEN brand snapshot, FROZEN script snapshot)
          ├─ inspecting   REAL  → ffprobe facts (duration, codec, display W/H, rotation, audio)
          ├─ transcribing REAL  → faster-whisper words + VAD/energy → speech component
          │                        (words, candidates: silence|filler|false_start|repetition,
          │                         boundaries: punctuation_sentence|asr_segment|pause_utterance)
          ├─ analyzing    REAL  → visual component (YuNet faces, motion diff curve, luma curve,
          │                        shot-boundary candidates, blank intervals w/ classification)
          │                     → audio component (integrated LUFS, true peak, noise floor,
          │                        median speech RMS, SNR, room tone, early energy ratio)
          │                     → hook component (opening-window words vs PINNED script hook,
          │                        matchedTokenRatio)
          ├─ directing    REAL, FLAG-GATED OFF
          │                     → Director Envelope (see Part 9) → ONE gemini-3.5-flash call,
          │                       temp 0.2, no retry → Decision v2 (13 bounded fields)
          │                     → server re-resolves every index against the pinned envelope
          ├─ compiling    SIMULATED (writeFile + sleep)
          ├─ rendering    SIMULATED
          └─ validating   SIMULATED
                      ▼
        edit_projects.status = 'completed', output_asset_id = NULL
        result: { simulated_after_analysis: true }   ← never a product success
                      ▼
        (publish + analytics: Postiz satellite, outside this pipeline)
```

### Stage table

| Stage | Input | Processing | Output | Model | Structured data | Consumed by |
|---|---|---|---|---|---|---|
| DNA scan | handle + platform | Apify actor (20 posts), owner filter, private-account guard | post samples, bio, ≤4 image URLs, stats | — | `PostSample[]`, `CreatorStats` | DNA synth |
| DNA synth | posts + bio + images | one call, `voiceProfileSchema`, ranked-by-reach corpus, top-5 marked `[TOP PERFORMER]` | voice profile | **gemini-3.1-pro-preview** → fb **gemini-2.5-flash** | `brand_voices.profile` (22 fields) + `brand_kit.palette` | blueprint prompt, editor brand snapshot |
| Reference ingest | URL | yt-dlp audio / YT captions / Apify IG | transcript + word timings | faster-whisper | `transcripts.{text,words,segments}` | structure, blueprint |
| Reference structure | timestamped transcript + measured wpm | one call | 6-field structure | **`env.fastModel`** (Gemini) | `transcripts.structure` | blueprint prompt only |
| Blueprint | DNA block + reference block + fidelity + tone | one call, attempt ladder, `blueprintComplete()` gate, `stripDashes`, `normalizeHookLine` | 12-object blueprint | **gemini-2.5-flash** (default; `GEMINI_MODEL` overridable) | `generations.blueprint` | recording script, thumbnail, UI |
| Recording script | blueprint + selected hook | **pure TS**, deterministic | `RecordingScript` | *none* | `generations.scene_timeline` | capture, script snapshot |
| Capture | scene_timeline | browser MediaRecorder, per-scene | take + capture contract | *none* | `media_assets`, `source_capture_*` | editor boot |
| Inspect | asset row / bytes | reuse validation facts, bounded ffprobe upgrade | inspection component | *none* | display W/H, rotation, duration, codecs | analyzing, envelope identity |
| Transcribe (take) | verified bytes | faster-whisper + VAD/energy rules | speech component (≤1 MB) | faster-whisper | words / candidates / boundaries | analyzing, envelope |
| Analyze | bytes + speech | OpenCV+YuNet bridge, ffmpeg loudnorm/ebur128, pure hook alignment | 3 digested components | pinned YuNet ONNX (no LLM) | visual / audio / hook JSON | Director summaries + visualWaste |
| Direct | envelope | ONE call, no retry, output = indices + enums only | Decision v2 | **gemini-3.5-flash** (frozen constant, not env) | `edit_director_decisions.decision` | *nothing yet — the compiler does not exist* |
| Compile/Render/Validate | — | `sleep()` | a `.txt` file in a temp dir | — | — | — |

**The consumption gap:** the Decision v2 object is persisted, hashed, and then read by
nobody. `editorDirector.ts:19` says so plainly: *"this stage records a Director DECISION.
It writes no edit_plan, no output asset."* The `edit_plans` table exists (`0078`) and is
unwritten.

---

## Part 2. Reference DNA — exactly what is extracted

The complete extraction is `ReferenceStructure` in `worker/src/structure.ts`:

```ts
{
  format_label:    string        // e.g. "talking-head myth-bust"
  hook_window_sec: number        // when the hook resolves (1–4s)
  why_it_works:    string[]      // 2–4 reasons grounded in THIS transcript
  beats:           { at_sec: number; beat: string; goal: string }[]
  cta:             string
  words_per_min:   number        // MEASURED from whisper word timings, not guessed
}
```

Plus, on the `transcripts` row: `text`, `words[]` (word-level timings), `segments[]`,
`language`, `duration_sec`, `platform`, `url_key`.

### Attribute-by-attribute verdict

**Legend:** ✅ extracted & used · ⚠️ extracted but weakly used · ⛔ extracted, never used
downstream · ❌ not extracted at all · 🚨 *not extracted but the model is asked to output it
anyway* (i.e. hallucinated)

#### Story
| Attribute | Status | Note |
|---|---|---|
| Hook (content) | ✅ | present in transcript text; hook shape reasoned from `beats[0]` + `hook_window_sec` |
| Opening style | ⚠️ | only as prose inside `why_it_works` / `beats[0].beat` |
| Story arc | ✅ | `beats[]` with timestamps — the strongest signal Twin has |
| Curiosity loops | ⚠️ | only if the model happens to name one in `beats[].goal` — no dedicated field |
| CTA | ✅ | dedicated field, fed to blueprint |

#### Editing
| Attribute | Status | Note |
|---|---|---|
| Scene count | ❌ | never counted; no frame analysis of the reference |
| Scene duration | ❌ | `beats[].at_sec` is a *narrative* timestamp, not a shot boundary |
| Cut rhythm | ❌ | no shot-boundary detection is ever run on a reference (only on the creator's own take) |
| Zooms | ❌ | |
| Transitions | ❌ | |
| Caption timing / style | ❌ | |
| B-roll count | 🚨 | `b_roll_stats.original_b_roll_count` is a **required blueprint field** produced by a model that has only read the transcript. This number is fabricated. |

#### Visual
| Attribute | Status |
|---|---|
| Layout, camera framing, background, lighting, colours, visual density | ❌ — **the reference video's pixels are never decoded.** `transcribeFromUrl` pulls *audio only* (`yt-dlp` audio-only by design, per `ARCHITECTURE.md` §4.4 and `media.ts`). |

#### Behaviour
| Attribute | Status | Note |
|---|---|---|
| Energy | ⚠️ | inferable only from word choice + wpm |
| Speaking speed | ✅ | `words_per_min`, measured from real word timings — genuinely good |
| Speed *variation* | ❌ | one scalar for the whole video |
| Gestures | ❌ | no video |
| Emotion | ❌ | no prosody model, no video |

#### Retention
| Attribute | Status | Note |
|---|---|---|
| Pattern interrupts | ⚠️ | only if verbal and named in a beat |
| Questions | ⚠️ | present in transcript, not tagged |
| Lists | ⚠️ | same |
| Open loops | ⚠️ | same |
| Pacing changes | ❌ | no per-segment wpm curve, though `segments[]` would make this trivial |

### Which are actually used / ignored / extracted-but-dead

- **Actually used:** `format_label`, `why_it_works`, `beats`, `cta`, `words_per_min`,
  transcript text — all serialized into the blueprint prompt at
  `generate-blueprint/index.ts:660-668`. `structure` is `JSON.stringify`'d and **clipped
  to 4000 chars**; transcript is clipped to 6000 chars (head 70% + tail 30%, so the
  payoff survives).
- **Extracted but never influences generation:** `hook_window_sec` reaches the model only
  as an incidental key inside the stringified structure blob — no prompt line references
  it, and nothing downstream reads it numerically. `words`/`segments`/`language`/
  `duration_sec` are persisted and **never sent to the blueprint at all**. Measured
  `words_per_min` reaches the model only inside the same blob; the blueprint has no
  duration or pacing target derived from it.
- **Should be extracted, currently is not (ranked by impact):**
  1. **Shot boundaries / cut rhythm.** The worker already has a shot-boundary detector
     (`editorVisual.ts`) that it runs on the creator's take. It is never pointed at the
     reference. This is the single highest-leverage missing extraction — it is the thing
     users mean by "make it like this."
  2. **Per-segment pacing curve.** `segments[]` already exists; a wpm-per-beat array is a
     pure function away.
  3. **On-screen text / caption style** (OCR on sampled frames).
  4. **Shot type / framing distribution** (talking head vs b-roll ratio) — would replace
     the fabricated `original_b_roll_count`.
  5. **Energy/loudness curve** — the audio is already downloaded; `editorAudio.ts`'s
     ebur128 pass would work unchanged.
  6. **Reference thumbnail / first frame** — free from every platform's metadata.

---

## Part 3. Creator / Brand DNA

Two stores, unified at write-time in `generate-blueprint`:

**A. `brand_voices.profile`** — the real DNA. Schema: `voiceProfileSchema` in `_shared/dna.ts`.

| Field | How created | Persistent | Changes over time | Consumed by |
|---|---|---|---|---|
| `summary` | Gemini from 20 ranked posts | yes | only on manual "Refresh voice" | blueprint |
| `niche` | same | yes | rescan only | blueprint, **editor: no** |
| `sub_niche` | same (+ deterministic fallback to `niche`) | yes | rescan | blueprint |
| `audience` | same (+ fallback `people into {niche}`) | yes | rescan; user-editable at onboarding confirm | blueprint |
| `audience_pain` | inferred | yes | rescan | blueprint (or an explicit INFER instruction if blank) |
| `dream_outcome` | inferred | yes | rescan | blueprint |
| `offer` | inferred | yes | user-editable | blueprint CTA target |
| `tone` | Gemini | yes | rescan | blueprint **+ editor brand snapshot** |
| `pacing` | Gemini | yes | rescan | blueprint **+ editor** (normalized to calm/balanced/punchy) |
| `hook_style` | Gemini, as a fill-in template | yes | rescan | blueprint **+ editor snapshot (48 chars)** |
| `hook_patterns[]` | Gemini; derived from `sample_hooks` if thin | yes | rescan | blueprint |
| `editing_style` | Gemini | yes | rescan | blueprint **+ editor snapshot → caption preset default** |
| `vocabulary[]` | Gemini, lifted from real captions | yes | rescan | blueprint |
| `recurring_ctas[]` | Gemini | yes | rescan | blueprint |
| `pov[]` | Gemini (beliefs they repeat) | yes | rescan | blueprint |
| `enemy` | Gemini | yes | rescan | blueprint |
| `dos[]` / `donts[]` | Gemini | yes | rescan | blueprint **+ editor snapshot (≤12 tokens × 48 chars)** |
| `sample_hooks[]` | Gemini | yes | rescan | blueprint |
| `formats[]` | Gemini (their video archetypes) | yes | rescan | blueprint `concept.premise` |
| `title_style` | Gemini | yes | rescan | blueprint `packaging.titles` |
| `thumbnail_style` | Gemini | yes | rescan | blueprint `packaging.thumbnail` |
| `brand_colors{primary,secondary,highlight}` | **Gemini vision on ≤4 real post images** | yes | rescan | blueprint backgrounds/props/wardrobe, thumbnail image prompt, **editor brand snapshot** |
| `voice_samples` (pasted writing) | user paste | yes | user edit | blueprint — **weighted above every other signal** |

**B. `profiles.dna`** — the onboarding-quiz fallback (`niche`, `audience`, `product`,
`goal`, `voice`, `editing_style`, `platforms`, `pain`, `dream`, `sub_niche`,
`voice_samples`). Used field-by-field only where the voice profile is absent
(`generate-blueprint:577-595`).

**C. `brand_voices.brand_kit`** — `palette{primary,secondary,highlight}`,
`palette_source` (`manual|auto|pending`), `logo_path`, `caption_style`,
`caption_preset_id`.

### Genuinely affects the generated video

Everything in **A** and **C** materially changes the blueprint text — the prompt is
explicitly built around them, and there are hard rules ("AT LEAST TWO of the five hooks
must reuse the creator's signature vocabulary or their exact hook FORMULA"). Voice
fidelity is the part of Twin that is actually strong.

### Exists but has little or no influence

- **Everything, once the creator hits record.** The editor sees only
  `EditorBrandSnapshotV1` (`brandSnapshot.ts`), which is a deliberately *bounded*
  projection: `tone` (48 chars), `pacing` (3-way enum), `hookStyle` (48 chars),
  `editingStyle` (48 chars), ≤12 do/don't tokens, 3 hex colours + source, logo path,
  caption preset. Niche, audience, offer, pov, enemy, vocabulary, formats, title style —
  **none of it reaches the Director.**
- **The colours reach the Director as data but nothing renders them** (no renderer).
- **`logo_path`** requires `logoSource: 'verified'` and no code path currently produces a
  `VerifiedLogo` for the boot pin — in practice it is `'none'`.
- **`goal`** is deliberately never fabricated at onboarding, so it is frequently blank and
  falls back to the literal string `'turn attention into trust'`.
- **`platforms`** only constrains `publish_plan`.
- **Previous content** exists only as the *derived* profile. The 20 scraped posts are not
  retained, not embedded, not retrievable. There is no "previous videos" store.

---

## Part 4. Knowledge layer

**There is no knowledge layer.** This is the largest architectural hole.

| Source | Status |
|---|---|
| Website | ❌ no fetch, no crawler, no field |
| Product catalogue | ❌ |
| Documentation | ❌ |
| Landing page | ❌ |
| Reviews / testimonials | ❌ |
| Screenshots | ❌ |
| Previous videos | ⚠️ only transitively, via the DNA profile synthesized once from 20 captions |
| Uploaded assets | ⚠️ `media_assets` exists but only ever holds the creator's own take; nothing else can be uploaded as source material |

**What exists today** as "facts about the user's business": `offer` (one inferred string),
`audience`, `audience_pain`, `dream_outcome`, `pov[]`, `enemy` — all *inferred from social
captions*, never verified. Plus the free-text `reference_note` (≤2000 chars) the user
types in the create box.

**Retrieval:** none. Nothing is semantic. There is no embedding, no vector column, no
similarity search anywhere in the repo. Every "retrieval" is a single-row primary-key
read: `profiles`, `brand_voices` (`is_default = true`), `transcripts` (by id).
The only cache is exact-match on a normalized reference URL
(`clone_cached_transcript(url_key)`).

**Consequence for claims.** The blueprint prompt bans fabricated view counts and says
"never invent a false factual claim", but there is **no evidence store to ground a claim
in and no verification step**. Any statistic, price, feature or product name in a Twin
script is model-generated from the niche. For a SaaS demo or a product ad, that is not a
minor gap — it is the product.

---

## Part 5. Intent layer

**Twin does not model intent.** It never asks, never classifies, never stores it.

The only intent-adjacent signals:

1. **`fidelity`** ∈ `close | balanced | loose` — how tightly to mirror the reference.
   Maps to a hard prompt directive (`FIDELITY_RULE`). Real, and it does change output.
2. **`tone`** ∈ `understated | balanced | punchy` — delivery energy (`TONE_RULE`).
   Real. Explicitly added for the founder/B2B persona.
3. **`reference_note`** — free text, unstructured, unparsed. The prompt calls it
   "Creator's angle/note".
4. **`goal`** on the DNA — a single free-text string, usually blank, defaulted to
   `'turn attention into trust'`.

Nothing infers *teach / sell / explain / review / launch / react / announce / compare*.
The blueprint's `concept.premise` is where the model implicitly decides this, invisibly
and unrecorded, so nothing downstream can condition on it.

**How this should improve.** Intent should be a first-class, persisted enum on
`generations` with (a) an explicit user pick in `V2Create` and (b) an LLM classification
of `reference_note` + reference structure as the default. It must then gate:
- which of the creator's `formats[]` is adapted,
- whether claims require evidence (sell/compare/review ⇒ **require** knowledge-layer
  citations; teach/react ⇒ don't),
- the CTA shape (save vs demo-booking vs link),
- the asset requirements (a product ad without a product image should *block*, not
  proceed — see Part 19),
- the Director's `pacing`/`music` defaults.

---

## Part 6. The Merge — who owns which decision

There are actually **two merges**, and only the first is real.

### Merge A — the writing merge (`generate-blueprint`, one Gemini call)

The merge is **entirely inside a single prompt**. There is no arbitration code, no
weighting, no conflict resolver. The prompt is assembled as:

```
CREATOR DNA  (24 labelled lines, with per-field INFER instructions when blank)
+ REFERENCE  (URL, platform, structure JSON ≤4000 chars, transcript ≤6000 chars, user note)
+ FIDELITY_RULE[fidelity]
+ TONE_RULE[tone]
+ 8 lines of explicit merge instructions
```

The merge *policy* lives in the SYSTEM prompt as a doctrine: **"We copy STRUCTURE, never
content."** Everything else is the model's judgement, at `temperature: 0.8`.

| Decision | Reference | Creator DNA | Knowledge | Intent | Where enforced |
|---|---|---|---|---|---|
| **Hook** | shape only | **owner** — vocabulary, `hook_patterns`, `pov`, `enemy` | — | tone rule | "fused with the reference's proven hook SHAPE"; ≥2 of 5 hooks must reuse creator vocabulary/formula |
| **Story / structure** | **owner** — `beats[]` order & count | tone | — | fidelity rule decides how tightly | `FIDELITY_RULE` |
| **Script (words)** | ⛔ none | **owner** | — | tone | "never reproduce the reference's exact words" |
| **Claims** | ⛔ | weakly (niche) | **absent** | ⛔ | **unowned — this is a real risk** |
| **Examples** | ⛔ | **owner** ("this creator's ACTUAL world") | absent | — | prompt ban on stock metaphors |
| **Tone** | ⛔ | **owner** | — | `tone` overlay | `TONE_RULE` layered on `vp.tone` |
| **Visual style** | ⛔ *(no visual extraction exists)* | **owner** — `brand_colors` into background/props/wardrobe | — | — | prompt line at `:655` |
| **Layout** | ⛔ | weak | — | — | only as prose in `script[].background` / `shot_list[].framing` |
| **Editing** | ⚠️ *prose only* — the model infers plausible editing from the transcript, never from frames | `editing_style` string | — | — | `edit_checklist`, `caption_packet` — **human-readable only** |
| **CTA** | shape (`structure.cta`) | **owner** — `offer`, `recurring_ctas` | — | — | "point it at the creator's product or offer" |
| **Assets / B-roll** | 🚨 fabricated count | `formats[]` | absent | — | `shot_list[].b_roll_type ∈ replicate|stock` — **neither is implemented** |
| **Background** | ⛔ | `brand_colors` | — | — | per-beat `background` field |
| **Text (on-screen)** | ⛔ | brand colours | — | — | `captions[]`, `packaging.thumbnail.text_overlay` |
| **Screens** | ⛔ | ⛔ | ⛔ | ⛔ | **not modelled at all** |

### Merge B — the editing merge (`editorDirector.ts`, one Gemini call)

Envelope contents: `script` (pinned recording-script snapshot), `summaries.brand` (bounded
snapshot), `summaries.{visual,audio,hook}` (a handful of scalars), `summaries.catalogs`,
`words[]`, `candidates[]`, `boundaries[]`, `visualWaste[]`.

**The reference is absent.** So is niche, audience, offer, intent, fidelity and tone.

| Editing decision | Owner |
|---|---|
| Which silences/false starts/repetitions to cut | Director model, constrained to server-issued `selectionEnabled=1` candidates |
| Filler removal | **Code — hard-disabled** (`EDITOR_FEATURES.autoFillerRemoval = false`, enforced in the projection *and* the validator *and* a DB trigger) |
| Visual dead air removal | Director, but only over `dead_air` intervals corroborated by *near-black AND frozen at the same sample* |
| Hook treatment | Director: `keep` or `open_at_word` (index must be a real word > 0) |
| Pacing / music | Director, 3-way enums |
| Caption preset | Director, 3 frozen presets — brand snapshot supplies the default |
| Transition policy | Director, 2 options (`hard_cuts_only`, `restrained`) |
| Zooms | Director, ≤20 requests, 2 intensities, 3 reason codes |
| Emphasis words | Director, ≤40 word indices |
| Crop / framing / reframe | **Nobody.** `FRAMING_PRESET_IDS` exists in the catalog and is *not* in Decision v2. |
| B-roll placement, overlays, graphics, music track choice | **Nobody.** |

The security architecture here is genuinely excellent — the model can only emit integers
and enum IDs, every index is re-resolved server-side against the pinned envelope, model
timestamps are ignored, free text is stored inert, and there is a byte-domination proof
that one inference always suffices. But **the creative surface is 13 knobs**, and the
reference — the thing the user actually pointed at — governs none of them.

---

## Part 7. The Creative Blueprint

**Yes, Twin creates an intermediate blueprint.** It is the strongest artefact in the
system. Schema (`blueprintSchema`, all 12 top-level keys required):

```
reference_read   { platform, format_label, why_it_works[], retention_map[{beat,goal,tactic}] }
concept          { premise, your_scale, translations[{theirs, yours}] }        ← the transfer contract
packaging        { titles[5], thumbnail{concept,text_overlay,expression,composition,colors} }
b_roll_stats     { original_b_roll_count, suggested_b_roll_count }             ← fabricated
hook_options     string[5]  (best first; [0] is forced into script[0].line by normalizeHookLine)
script[]         { section, line, direction, background, cuts_info, action_posing }
shot_list[]      { shot, framing, notes, shot_type, b_roll_type, b_roll_visual, spoken_text }
captions[]       string[]   (3–6 words each)
edit_checklist[] string[]
caption_packet   { caption_style, pacing, emphasis, export }
publish_plan[]   { platform, caption, hashtags[], best_time }
production_sprint[] { minute, task }
```

Post-processing is deterministic: `stripDashes()` (em/en dashes → commas, because thinking
models ignore the instruction), `normalizeHookLine()` (replaces `[Hook Option 1]`-style
placeholders in `script[0].line` with `hook_options[0]`), and `blueprintComplete()` (rejects
an attempt that silently dropped `concept`/`packaging` — Gemini's `required` is advisory).

### What it covers vs. what a *creative* blueprint should cover

| Required capability | Present? |
|---|---|
| Story | ✅ `concept.premise`, `retention_map` |
| Scene purposes | ⚠️ `script[].section` (Hook / Setup / Re-hook / CTA) — a label, not a purpose model |
| Emotion | ⚠️ only inside `action_posing` prose |
| Energy | ⚠️ only via the global `tone` knob |
| Visual strategy | ⚠️ per-beat `background` prose; no global strategy object |
| Layout | ❌ |
| Asset requirements | ⚠️ `shot_list[].b_roll_visual` is prose; there is no machine-readable asset manifest, no "do you have this?" check |
| Evidence requirements | ❌ **entirely absent** |
| Editing intent | ⚠️ `cuts_info` + `edit_checklist` + `caption_packet` — all prose, **none machine-consumable** |

**The design gap:** the blueprint is a *document for a human*, not a *plan for a machine*.
Its editing fields are typed as `STRING` and consumed by React components. Nothing in the
editor reads any of it except the `dialogue`/`hook` strings that survive into the
recording-script snapshot.

**What should be added** (as typed siblings, not prose):

```
creative_blueprint.strategy {
  intent: enum, emotional_arc: [{beat, emotion, energy 0-100}],
  visual_strategy: { dominant_layout, cut_density_per_min, caption_style_id, zoom_policy },
  asset_manifest: [{ id, kind: product_shot|screenshot|graphic|stock|text_card,
                     required: bool, prompt, fallback: text_card_copy }],
  evidence_requirements: [{ claim, needs: stat|demo|testimonial|none, source: uri|null }]
}
```

---

## Part 8. Scene Blueprint

Twin has **two** scene models and they do not agree in richness.

**`RecordingScene`** (`recordingScript.ts`, built deterministically by
`recordingScriptAdapter.ts`):

| Field | Present | Owner |
|---|---|---|
| Scene purpose | ✅ `purpose` — but only 3 hardcoded strings + `seg.section` |
| Main message | ✅ `dialogue` |
| Emotion | ❌ |
| Speaker | ❌ (single-speaker assumed everywhere) |
| Visual support | ⚠️ `background`, `movement` (prose) |
| Required assets | ❌ |
| Layout | ⚠️ `camera_framing` (prose) |
| Importance | ❌ |
| Duration | ✅ `duration_sec` — **estimated from word count at a wpm preset**, not from the reference's actual beat durations |
| Transition | ⚠️ `pause_after: boolean` only |
| Editing intention | ❌ |

**`RecordingScriptSnapshot`** (what the editor actually pins, `scriptSnapshot.ts`) is
narrower still: `{ sceneNumber, sceneType, dialogue, showInTeleprompter }`. Purpose,
framing, background, movement, caption text and duration are **dropped at the editor
boundary**. So the Director cannot know that scene 4 was meant to be a product demo with a
tight framing — it only knows the words.

**How this layer should work.** One `SceneBlueprint` should survive intact from blueprint
→ capture → editor:

```ts
interface SceneBlueprint {
  id; ordinal
  purpose: 'hook'|'setup'|'proof'|'rehook'|'demo'|'objection'|'payoff'|'cta'
  message: string
  emotion: {valence, arousal}; energy: 0..100
  speaker: 'creator'|'guest'|'voiceover'|'silent'
  visual: { layoutId, framingPresetId, backgroundSpec }
  assets: AssetRequirement[]           // machine-readable, checkable
  importance: 0..100                   // budgets edit time + zoom + emphasis
  targetDurationSec: number            // derived from the REFERENCE beat, not wpm
  transitionOut: TransitionPresetId
  editingIntent: { cutDensity, zoomPolicy, captionEmphasis }
}
```

`importance` and `targetDurationSec` are the two fields whose absence most directly caps
edit quality: without them the Director has no basis for *where* to spend zooms, emphasis,
or cuts, which is why those choices are currently unanchored.

---

## Part 9. Editor instructions — the actual data structures

### What the editor receives (Director Envelope, `directorContract.ts`)

```jsonc
{
  "schemaVersion": 1, "pipelineEpoch": 2,
  "bundle":   { "version":"director-1","provider":"google","model":"gemini-3.5-flash",
                "promptSha256":…, "schemaSha256":…, "configSha256":… },
  "identity": { "projectId","generationId","sourceAssetId","sourceChecksum",
                "bootManifestSha","scriptSnapshotSha",
                "componentVersions":{"inspection","speech"},
                "componentDigests":{"visual","audio","hook"} },
  "script":   { "schemaVersion":1,"generationId":…,"hook":string|null,
                "scenes":[{"sceneNumber","sceneType","dialogue","showInTeleprompter"}] },
  "summaries":{ "brand":  EditorBrandSnapshotV1,
                "visual": { "shotCount", "blankIntervalCount", "selectableWasteCount",
                            "faceCoverage":{"withFace","total"} },
                "audio":  { "integratedLufs","truePeakDbtp","noiseFloorDb","snrDb" },
                "hook":   { "firstWordStartMs","wordCount","matchedTokenRatio" },
                "catalogs": {...}, "features": {"autoFillerRemoval": false} },
  "words":       [ [text, startCs, confPct], … ],                  // index == word id
  "candidates":  [ [kindCode,startCs,endCs,confCode,silClassCode,selectionEnabled,[wordIdx…]], … ],
  "boundaries":  [ [kindCode, startWordIdx, endWordIdx], … ],
  "visualWaste": [ [startCs, endCs, classCode, selectionEnabled], … ]
}
```

Hard caps: ≤16 949 words, ≤4 901 candidates, ≤9 523 boundaries, ≤60 visual-waste, script
≤64 KiB, summaries ≤16 KiB, whole envelope ≤819 200 bytes — every bound *derived* from the
1 MB speech budget with a written proof, not hand-tuned.

### What the editor emits (Decision v2)

```jsonc
{
  "schemaVersion": 2,
  "selections":          [ {candidateIndex, kind, selectionEnabled, startCs, endCs}, … ],
  "visualWasteSelections":[ {wasteIndex, classCode, startCs, endCs}, … ],
  "keptBoundaries":      [int, …],                       // ≤512
  "emphasisWordIndices": [int, …],                       // ≤40
  "hookTreatment":       "keep" | "open_at_word",
  "hookStartWordIndex":  int|null,
  "pacing":              "calm"|"balanced"|"punchy",
  "music":               "none"|"subtle"|"energetic",
  "captionPresetId":     "caption-clean-keyword-v1"|"caption-punchy-word-v1"|"caption-minimal-subtitle-v1",
  "transitionPolicy":    "hard_cuts_only"|"restrained",
  "zoomRequests":        [ {anchorWordIndex, intensity:"subtle"|"medium",
                            reasonCode:"emphasis_word"|"scene_open"|"retention_beat"}, … ],  // ≤20
  "summary":             string ≤2000 chars   // INERT, never interpreted
}
```

### Data structures that **do not exist**

- **Timeline object** — none. No clip list, no track model, no time-ordered structure.
- **Scene objects in the edit** — none; the edit knows words and spans, not scenes.
- **Crop instructions** — none. `FRAMING_PRESET_IDS` is defined and unused.
- **Caption instructions** — only a preset *ID*; no per-word render spec, no style,
  no position, no colour binding.
- **Asset references** — none.
- **Effects** — zooms only, as anchor+intensity requests, never resolved to keyframes.
- **EditPlan** — the `edit_plans` table exists (`0078`) and is never written.

### Intelligence before vs inside the editor

**Before the editor (blueprint stage):** essentially all of the creative intelligence —
concept, hooks, story order, tone, packaging, CTA, brand. It is *text* intelligence.

**Inside the editor:** measurement intelligence, not creative intelligence.
- Deterministic and strong: whisper word timings, VAD/energy silence classification,
  false-start/repetition rules, YuNet face detection, motion/luma curves, shot-boundary
  candidates, EBU R128 loudness, SNR, hook-alignment token matching.
- Model-driven and narrow: 13 bounded choices from one gemini-3.5-flash call.
- Rendering intelligence: **zero** — nothing consumes any of it.

The safety engineering (fencing tokens, boot-manifest pinning, set-once resume,
lease renewal, cancellation ledger with `unknown` states, digest-keyed evidence,
`manifest_mismatch` fail-closed) is unusually rigorous for this stage of product. It is
the infrastructure for an editor that does not yet edit.

---

## Part 10. Image / asset generation

**The complete inventory of image generation in Twin is one function:
`generate-thumbnail`.**

Decision pipeline:
1. User taps a button on the Result page (never automatic — "costs nothing unless asked").
2. Rate limits: 6/min, 30/day (`THUMBNAIL_DAILY_CAP`).
3. Load `generations.blueprint.packaging.thumbnail`. If `concept`/`text_overlay`/
   `composition` are all empty → 400 "regenerate the plan first."
4. Load `brand_voices.brand_kit.palette` → hex list.
5. Build a fixed-template prompt: 9:16 vertical, `concept`, `composition`, exact
   `text_overlay` string, `colors` + brand hexes.
6. **Hard constraint: "do NOT include any human face, person, portrait, hands, or body —
   NO people at all,"** because Twin has no creator likeness. This is honest and correct,
   and it also means Twin cannot produce the thumbnail style that actually works in most
   niches (a face with an expression).
7. `gemini-2.5-flash-image`, 3 attempts with jittered backoff, 40 s timeout.
8. Store to `edits/{user_id}/ai-thumb/…`, persist `generations.ai_thumb_path`, return a
   30-day signed URL.

**Everything else does not exist:**

| Question | Answer in code |
|---|---|
| What image is needed? | Only ever "the cover frame". No other image is ever needed, because nothing else consumes images. |
| What screenshot is needed? | Never modelled. No screen-capture, no URL screenshotting. |
| What product image is needed? | Never modelled. There is no product entity. |
| What graphic is needed? | Never modelled. |
| What text replaces a missing asset? | **No fallback exists** — because there is no asset requirement to fall back from. |

`shot_list[].b_roll_type ∈ {replicate, stock}` and `b_roll_visual` (a full visual
description) are generated by the blueprint model and consumed by exactly two things:
the React shot-list card, and `recordingScriptAdapter`'s `BROLL_HINT` regex, which turns
up to 3 of them into **silent scenes the creator must film themselves**. `'stock'` implies
a stock library Twin does not integrate with; `'replicate'` implies reference footage Twin
never downloaded.

---

## Part 11. Capability matrix

Definitions used below: **Twin replicates** = what actually transfers from a reference
today; **User must provide** = what the creator supplies out of band or the output is
unusable; **Missing intelligence** = the specific capability that would change the answer.

| Video type | Current support | What Twin replicates | What user must provide | Missing intelligence |
|---|---|---|---|---|
| **Talking head** | **Strong (writing)** — this is the only shape the whole pipeline assumes | Hook shape, beat order, CTA, pacing target, voice | Camera, lighting, delivery, all filming | The edit itself (compiler/renderer). Everything upstream fits. |
| **Educational** | **Strong (writing)** | Explanation beat structure, re-hook placement, retention map | The actual accurate content; any diagram or example | Fact grounding; there is no knowledge layer so every explanation is model-recalled |
| **Founder content** | **Good** — `tone: understated` was built for this persona | Structure + a credible register; `voice_samples` (pasted writing) is weighted above all other voice signals | Their real numbers, real story, real product truth | Knowledge layer; no company/product entity exists |
| **Product ads** | **Weak** | Story arc and hook shape only | Product, product footage, product images, all claims, price, offer | No product entity, no asset pipeline, no claim verification, no image generation of products |
| **UGC** | **Weak-to-moderate** | Script and hook | Everything visual; the whole performance | No shot-level direction that survives to the edit; no multi-take selection |
| **SaaS demos** | **Very weak** | Narrative order | Screen recording, product, every feature claim | No screen-capture ingestion, no screen-region model, no multi-source composition (screen + cam), no zoom-to-region |
| **Podcasts** | **Not supported** | — | — | Single-speaker assumption everywhere: no diarization, no speaker field, no multi-cam switching, no long-form (source cap 30 min), no clip extraction |
| **Vlogs** | **Not supported** | — | All footage | No b-roll ingestion, no multi-clip assembly, no timeline; the editor takes exactly ONE source asset |
| **Reviews** | **Weak** | Review beat order from the reference transcript | The product, all specs, all footage | No product/spec knowledge, no comparison model, no evidence store |
| **Travel** | **Not supported** | — | All footage | Same as vlogs: one source asset, no assembly, no music-driven cutting |
| **Documentary** | **Not supported** | — | Everything | No archival/asset layer, no interview structure, no multi-source, no long-form |
| **Dance** | **Not supported** | Nothing meaningful — the entire pipeline is speech-driven (whisper words are the atomic unit of the editor) | — | Beat/tempo detection, motion-synced cutting, pose analysis. The editor literally cannot cut a video with no speech: `words`, `candidates` and `boundaries` would all be empty. |
| **Fashion** | **Not supported** | Caption/hook text only | All footage | Same as dance: music-driven, visual-driven, non-speech |
| **Beauty** | **Weak** | Tutorial beat order | Product, footage, close-ups | Macro/close-up direction, product entity, colour-accurate handling |
| **MrBeast-style** | **Not supported** | The *psychology* only — the blueprint's `concept.your_scale` + `translations` honestly downscale it ("theirs: flies ten strangers to an island / yours: one visible personal challenge with a countdown timer") | Production, cast, locations, stakes | Everything: multi-cam, graphics, countdown overlays, sound design, budget. The `translations` field is Twin's honest admission that it cannot do this. |

**Summary:** Twin genuinely supports **one person, one phone, one continuous
talking-head take, in a niche where the creator already knows the facts.** Everything
else is either unsupported or supported only at the script layer.

---

## Part 12. Reference transfer rules — the actual algorithm

### The literal transfer mechanism

There is no rules engine. Transfer happens in exactly three places:

1. **`FIDELITY_RULE[fidelity]`** — one of three hard prompt directives.
2. **The `WHAT WE COPY` doctrine** in the system prompt: *"We copy STRUCTURE, never
   content. Reuse the proven PATTERN of this format on this platform: the hook shape, the
   pacing, the retention beats. Never reproduce the reference's exact words, footage, or
   claims."*
3. **`concept.translations[{theirs, yours}]`** — the model is required to emit 2–4
   explicit pairs mapping a reference element to an achievable equivalent. **This is the
   only place in the entire system where transfer is made explicit and inspectable.**

### What transfers, by field

| Reference element | Transfers? | Mechanism |
|---|---|---|
| Beat order & count | ✅ | `structure.beats[]` in the prompt; `close` fidelity says "same number and order" |
| Hook *type* | ✅ | "fused with the reference's proven hook SHAPE" |
| Hook *words* | ⛔ | explicitly banned |
| CTA *shape* | ✅ | `structure.cta` |
| CTA *target* | ⛔ | comes from creator `offer` |
| Pacing target | ⚠️ | `words_per_min` present in the structure blob; no explicit prompt line uses it |
| Retention tactics | ✅ | `why_it_works[]` + `beats[].goal` → `retention_map` |
| Claims / facts | ⛔ banned | "Never invent view counts or fabricate specifics" |
| Examples | ⛔ | "must come from THIS creator's ACTUAL world" |
| Product order (e.g. review ordering) | ⛔ | not extracted; no ordering model |
| Research | ⛔ | no retrieval exists |
| Visual rhythm | ⛔ | **cannot transfer — never extracted** |
| Editing / cut rhythm | ⛔ | **cannot transfer — never extracted** |
| Title *shape* | ⚠️ | prompt says "the reference's proven title SHAPE" but the reference title is never fetched; the model infers it from the transcript |
| Thumbnail | ⛔ | reference thumbnail never fetched |

### Scenario-shaped answers

**Tech reviewer → tech reviewer.** Transfers: beat order, hook shape, CTA shape, retention
tactics. Does *not* transfer: product order, specs, benchmark numbers, editing, camera
work, b-roll. Because the two creators share a niche, the DNA and reference agree, so the
output is at its strongest — but it is still a *script*, and every spec in it is
model-recalled, not retrieved.

**Finance creator → fitness reference.** Transfers exactly the same things: the beat
skeleton and hook shape. The creator's `niche`, `sub_niche`, `vocabulary`, `pov` and
`enemy` force every noun to change. This cross-domain case is where the "structure not
content" doctrine works *best*, because there is no risk of content bleed.

**Skincare brand → MrBeast.** The doctrine holds and `your_scale` forces the honest
downscale, but nothing enforces feasibility: the model may still write a beat requiring
production the brand doesn't have. There is no capability check.

**SaaS founder → cooking video.** Only the beat rhythm and hook shape transfer. The
`translations` pairs are where this either works or embarrasses itself, and it is
unvalidated.

### Five references at once

**Not possible.** `generations` has a single `reference_url`, `reference_note`,
`transcript_id`. `V2Create` accepts one input. `generate-blueprint` reads one transcript.

So the answer to "does Twin average / rank / blend / choose one / extract common
patterns?" is: **none of the above — it rejects the input shape.** The user must run five
separate generations, which produce five unrelated blueprints with no shared state.

**The algorithm it should have** (there is currently nothing to document, so this is a
design):

```
1. INGEST each reference independently → ReferenceStructure_i (+ visual structure, once extracted)
2. NORMALIZE each to a canonical beat skeleton: [{role, relative_position, goal, tactic}]
     role ∈ hook|setup|proof|rehook|escalation|payoff|cta
3. CLUSTER by role. For each role slot compute agreement = |refs containing it| / N
4. RANK references by (a) explicit user weighting, (b) niche distance to Creator DNA,
   (c) recency, (d) reach
5. RESOLVE per attribute, not per reference:
     structural attributes (beat roles, ordering, rehook position) → MAJORITY VOTE,
        ties broken by rank; agreement < 0.5 → drop the slot rather than invent one
     scalar attributes (wpm, cut density, energy) → RANK-WEIGHTED MEDIAN (not mean —
        one MrBeast reference must not drag a cinematic set to 180 wpm)
     categorical/aesthetic attributes (caption style, transition policy, music) →
        DOMINANT-REFERENCE WINS (the top-ranked reference owns it outright), because
        blending aesthetics produces incoherence, not a blend
6. REPORT: emit a per-attribute provenance map (which reference won each slot) and an
   explicit conflict list, so the user sees the merge rather than a mystery
7. If two top-ranked references disagree on a categorical attribute AND their ranks are
   within tolerance → ASK, do not average (see Part 17 Scenario 10)
```

---

## Part 13. Knowledge generation — where does anything come from?

### "Make me five tech video ideas"

**This feature does not exist.** There is no ideas endpoint, no ideas UI, no ideas table.

The closest thing is `discovery/` — a daily cron (`discover.py`, Scrapling +
StealthyFetcher) that scrapes YouTube/TikTok *search results* per niche and returns
`{url, title, views, likes, creator, thumbnail, platform}` into the gallery. That is
**reference discovery**, not idea generation: it surfaces other people's videos to remix,
it does not propose concepts.

So today, "an idea" originates as: *a URL the user pastes*, or *free text the user types*.
Twin generates no ideas.

### Origin of every generated element, today

| Element | Origin | Grounded in anything? |
|---|---|---|
| Ideas | ❌ feature absent | — |
| **Hooks** (5) | Gemini, from `hook_patterns` + `vocabulary` + `pov`/`enemy` + reference hook shape | Grounded in the creator's real captions (their actual hooks are in the prompt) |
| **Titles** (5) | Gemini, following `title_style` | Weakly — `title_style` is itself inferred |
| **Claims** | **Pure model recall.** No retrieval, no verification, no citation. | ❌ **nothing** |
| **Examples** | Gemini, constrained to "THIS creator's ACTUAL world" — which the model only knows through 22 inferred DNA fields | ❌ effectively ungrounded |
| **Analogies** | Gemini, with an explicit ban on stock metaphors ("secret sauce", "the grind", "level up") | ❌ |
| **Frameworks** | Baked into the SYSTEM prompt as doctrine: the 3-second rule, Hook→Retain→Reward (Hormozi), MrBeast retention, the four cognitive triggers | Not retrieved — hardcoded |
| **Statistics** | **Pure model recall**, with a prompt ban on inventing *view counts* specifically. Any other statistic is unguarded. | ❌ **the single most dangerous gap** |
| **Scripts** | Gemini, one call | Structure grounded in the real transcript; content grounded only in DNA |
| **Stories** | Gemini | ❌ Twin has no store of the creator's real stories |
| **Objections** | ❌ not modelled at all | — |
| **Product positioning** | `offer` — one inferred sentence | ❌ |
| **CTAs** | `recurring_ctas` + `offer` | ✅ grounded in real captions |

### How it should work

Every generated element should carry a `provenance` tag, and elements whose provenance
would be `model_recall` in a *claim* position should be **blocked or flagged**, not
emitted silently:

```
retrieved   — from the knowledge layer, with a source URI          (claims, stats, specs, prices)
creator     — from a DNA field or the creator's own prior content  (stories, vocabulary, POV, CTAs)
reference   — from the reference structure                          (beat order, hook shape, pacing)
reasoned    — generated, no external ground                          (analogies, framing, transitions)
inferred    — derived from intent                                    (CTA type, energy)
composed    — a combination, with contributing sources listed
```

Ideas specifically should come from a ranked join of: intent × creator `formats[]` ×
knowledge-layer entities (products, features, docs pages) × discovery trends × content
gaps vs the creator's own history — none of which currently exists except `formats[]`
and discovery.

---

## Part 14. Limitations

| # | Limitation | Why it exists | Architectural or implementation? | Affects positioning? | Solve before launch? |
|---|---|---|---|---|---|
| 1 | **No final video is produced** | `compiling`/`rendering`/`validating` are `runSimulatedStage()` | Implementation (Phase 8 planned; contracts exist) | **Fatally** — "one-click editor" cannot be claimed | **Yes — blocking** |
| 2 | **The reference never reaches the editor** | The Director envelope has no reference field; editing was designed as an evidence-only pipeline | **Architectural** | Yes — "make it like this" is only half true | Yes, at least the pacing/cut-density scalars |
| 3 | **Reference is audio-only** | `transcribeFromUrl` pulls audio; cost + speed decision | **Architectural** for anything visual | Yes — no visual replication is possible | Yes for cut rhythm; later for full visual |
| 4 | **No knowledge layer** | Never built | **Architectural** | Yes — blocks product ads, SaaS, reviews, comparisons | Yes if selling to businesses; no if selling to creators |
| 5 | **No intent model** | Never built | Architectural, but cheap to add | Yes — every downstream decision is unconditioned | Yes (cheap, high leverage) |
| 6 | **Claims and statistics are ungrounded** | Consequence of #4 | Architectural | Yes — a legal/trust risk in regulated niches | Yes — at minimum, flag them |
| 7 | **Single reference only** | Schema (`generations.reference_url`) | Architectural (schema + prompt + merge algorithm) | Moderate | No — v2 |
| 8 | **Single source asset in the editor** | `edit_projects.source_asset_id` is one FK | **Architectural** | Yes — rules out vlogs, travel, documentary, podcasts, multi-take | No, but it caps the TAM permanently until fixed |
| 9 | **Speech-driven editor** | Words are the atomic unit of the envelope | **Architectural** | Yes — dance/fashion/music content is structurally impossible | No — but never promise those categories |
| 10 | **No diarization / single speaker** | Never built | Architectural | Rules out podcasts, interviews | No |
| 11 | **30-minute source cap** | `SOURCE_MAX_DURATION_MS`, and `MAX_TIME_CS` is derived from it | Implementation (bounded, provable) | Rules out long-form | No |
| 12 | **Filler removal hard-disabled** | Deliberate: recall gate not met (task #117); enforced in 3 layers | Implementation, intentional | Minor | No — the honesty is correct |
| 13 | **No crop/reframe** | `FRAMING_PRESET_IDS` defined, not in Decision v2 | Implementation | Moderate — vertical reframe is table stakes | Yes, with the renderer |
| 14 | **Blueprint editing fields are prose** | Typed as `STRING`, consumed by React | **Architectural** — this is why intelligence doesn't cross the record boundary | Yes | Yes — cheapest high-impact fix |
| 15 | **`b_roll_stats.original_b_roll_count` is fabricated** | Required schema field, model never saw the video | Implementation | Small but it is a visible honesty defect | Yes — remove or ground it |
| 16 | **No asset pipeline** (stock, product, screenshots) | Never built; `b_roll_type: 'stock'` implies an integration that doesn't exist | Architectural | Yes — blocks every non-talking-head category | No — but stop implying it |
| 17 | **Thumbnail cannot contain a person** | Honest: no creator likeness | Architectural (needs a likeness capture step) | Yes — face thumbnails outperform in most niches | No; solvable by capturing a still at record time |
| 18 | **Director gated off in production** | `EDITOR_DIRECTOR_ENABLED` unset | Implementation | — | Yes, once #1 lands |
| 19 | **No embeddings / semantic retrieval anywhere** | Never built | Architectural | Enables #4, #7, #13 | With #4 |
| 20 | **Scene richness is dropped at the editor boundary** | `RecordingScriptSnapshot` keeps 4 fields per scene | Implementation (snapshot shape is frozen + hashed, so changing it is a policy-version bump) | Yes | Yes |
| 21 | **Blueprint quality depends on a `-flash` model** | `gemini-3.1-pro-preview` timed out at 60–90 s against the edge wall-clock, so the default fell back to `gemini-2.5-flash` | Implementation (edge-function time budget) | Yes — the most important call in the product runs on the fastest model for infra reasons | Yes — move blueprint generation to the worker queue where there is no wall-clock |

---

## Part 15. Product positioning

### What Twin actually is, architecturally

**Twin is a reference-conditioned script and shot-plan generator for solo talking-head
creators, with a rigorously-engineered but not-yet-connected media analysis pipeline
attached to it.**

Stated precisely, it is three things:
1. A **voice-modelling system** that turns a social handle into a 22-field creative
   identity — genuinely good, genuinely differentiated.
2. A **structure-transfer engine** that reads a reference's *narrative* skeleton from its
   transcript and re-clothes it in that identity — real, honest about its limits
   ("we copy structure, never content"), and bounded by the fact that it has only ever
   heard the reference.
3. A **provenance-obsessed media analysis harness** — boot-manifest pinning, fencing
   tokens, digest-keyed evidence, server-side re-resolution of every model output — which
   currently measures a recording precisely and then does nothing with the measurement.

It is **not** an editor. It is **not** a video generator. It is **not** a knowledge system.

### What Twin genuinely dominates today

**Getting a solo creator from "I saw a video that worked" to "I know exactly what to say,
in my voice, on camera, in the next 20 minutes."** The blueprint — hooks that reuse the
creator's real vocabulary, a beat structure lifted from a real transcript, a shot list, a
teleprompter, packaging, and a publish plan — is a genuinely strong artefact, and the
production-sprint framing makes it actionable. Nobody's scripting tool has this quality of
voice modelling built from the creator's actual top-performing posts.

### What the homepage should promise today

- "Paste a video that worked. Get the script, hooks, and shot plan — in your voice."
- "We learn your voice from your real posts, not a questionnaire."
- "We copy the structure, never the content."
- "Record it with the built-in teleprompter, scene by scene."

### What it must never promise

- "AI edits your video" / "one-click editing" — **no video is produced.**
- "Recreate any video" — the reference's visuals, cuts, transitions and captions are never
  read.
- "Knows your product / your business / your docs" — nothing is retrieved.
- Any factual accuracy guarantee — claims and statistics are ungrounded model recall.
- Podcasts, vlogs, travel, documentary, dance, fashion, multi-clip anything.
- "Combine multiple references" — one reference per generation.

### Categories to add later, in dependency order

1. **Vertical reframe + captions + jump cuts rendering** (unblocks the existing editor).
2. **Reference visual extraction** → cut rhythm, caption style, shot density (makes
   "like this" true).
3. **Intent model** (cheap; conditions everything downstream).
4. **Knowledge layer** (website + product catalogue + docs, semantic) → unlocks product
   ads, SaaS demos, reviews, comparisons — i.e. the *paying* segments.
5. **Asset pipeline** (stock, screenshots, product shots, generated graphics) → unlocks
   b-roll-heavy formats.
6. **Multi-source editing** → vlogs, travel, podcasts.

### Real competitive advantage

Two things, and they are unusual:

1. **Voice fidelity built from evidence.** Ranking a creator's posts by reach, marking the
   top 5 as `[TOP PERFORMER]`, extracting `pov`/`enemy`/`hook_patterns`, and reading the
   brand palette from real post imagery with vision — then enforcing at write time that
   ≥2 of 5 hooks reuse the creator's own vocabulary. Most competitors take a tone slider.

2. **Provenance and determinism as a first-class architecture.** Boot manifests, frozen
   catalogs, server-side re-resolution of every model index, byte-domination proofs,
   fail-closed manifest mismatch, `unknown` ledger states for uncertain charges. This is
   the substrate for the thing that actually matters long-term: *a decision engine whose
   every decision can be traced, explained, replayed and audited.* No competitor is
   building this. It is currently invisible to users because there is no product surface
   on top of it — but it is the moat, and the moat is being built before the product.

---

## Part 16. Decision provenance

Percentages are qualitative weights of *causal influence* on the final artefact today
(the blueprint + recording plan, since no video is produced). "AI reasoning" means
ungrounded generation.

| Decision | Reference DNA | Creator DNA | Knowledge | Intent | AI reasoning | Why |
|---|---|---|---|---|---|---|
| **Hook** | 25% | 45% | 0% | 10% | 20% | Reference supplies the *shape* (`beats[0]`, `hook_window_sec`); DNA supplies vocabulary, `hook_patterns`, `pov`, `enemy` and is prompt-enforced (≥2 of 5 must be unmistakably theirs); `tone` overlays energy; the rest is generation. |
| **Story** | 55% | 20% | 0% | 15% | 10% | `structure.beats[]` is the skeleton and `fidelity` decides how tightly it is followed (`close` = "same number and order"); DNA's `formats[]` picks which archetype is adapted. |
| **Examples** | 0% | 40% | **0%** | 5% | 55% | Prompt forbids reference examples and demands the creator's real world — but Twin only *knows* that world through 22 inferred fields, so most of the specificity is generated. |
| **Claims** | 0% | 10% | **0%** | 5% | **85%** | **The weakest row in the system.** No retrieval, no verification, no citation. The only guard is a prompt ban on inventing view counts. |
| **Tone** | 5% | 70% | 0% | 20% | 5% | `vp.tone` + `pacing` + `dos`/`donts` dominate; `TONE_RULE` is a deliberate user override. Reference contributes almost nothing (register is not extracted). |
| **Camera style** | **0%** | 15% | 0% | 0% | 85% | Reference visuals are never decoded. `camera_framing` comes from `shot_list[].framing`, which the model invents; DNA contributes only via `editing_style` prose. |
| **Captions** | 0% | 30% | 0% | 0% | 70% | Blueprint `captions[]` and `caption_packet` are generated. In the editor, `captionPresetId` defaults deterministically from the brand snapshot's `caption_style`/`editing_style`/`pacing`, then the Director may override from 3 presets. |
| **Layout** | 0% | 5% | 0% | 0% | 95% | Not modelled anywhere. Emitted as prose in `background`/`composition`. |
| **Product shown** | 0% | 20% | **0%** | 10% | 70% | `offer` is one inferred string. There is no product entity, no catalogue, no image. |
| **CTA** | 20% | 55% | 0% | 15% | 10% | `structure.cta` gives the shape; `recurring_ctas` + `offer` give the substance (genuinely grounded in real captions); intent should own this and currently doesn't. |
| **Pacing (editor)** | **0%** | 40% | 0% | 0% | 60% | Brand snapshot's `pacing` is the default; the Director picks calm/balanced/punchy from *its own* recording's evidence. The reference's measured wpm — which Twin has — is never consulted. |
| **Cuts (editor)** | **0%** | 0% | 0% | 0% | 100% | Director selects removable spans purely from the take's silence/false-start evidence. Nothing about the reference, the creator, or the intent conditions it. |

---

## Part 17. Scenario engine

For each scenario: what Twin *actually* does today, then what it *should* do.

### Scenario 1 — AI founder builds Twin, audience = startup founders; reference = Hormozi on pricing

**Transfers today:** the beat skeleton from Hormozi's transcript (`beats[]` with
timestamps), the hook shape, the CTA shape, the retention tactics named in
`why_it_works[]`, and the measured wpm (as an unused number in the blob).

**Rewritten:** every word. The prompt forbids reproducing Hormozi's words, and the
`understated` tone rule was written for exactly this persona ("the kind of thing a founder
could say to a buyer without cringing").

**Stays unique to the creator:** `pov`, `enemy`, `vocabulary`, `offer` (Twin),
`audience_pain`, and — critically — `voice_samples`, which if the founder pasted LinkedIn
posts is weighted **above every other voice signal**.

**Does not transfer:** Hormozi's whiteboard, his cut rhythm, his caption style, his
numbers. None of it is extracted.

**Production blueprint (real output shape):**
```
concept.premise       "Why we price Twin per finished video, not per seat" (adapting the
                      founder's own `formats[]` archetype to Hormozi's value-stacking mechanism)
concept.your_scale    one person, phone, no team — stated honestly
concept.translations  theirs "$100M portfolio of case studies" → yours "one pricing decision
                      we got wrong and what it cost us"
packaging.titles      5, following the founder's `title_style`
hook_options          5, ≥2 reusing the founder's exact vocabulary/formula, each from a
                      DIFFERENT hook_pattern, ≥1 asserting their `pov` or naming their `enemy`
script[]              Hook / Setup / Re-hook (~40% mark, mandatory) / CTA, full paragraphs,
                      each with background + cuts_info + action_posing
shot_list[]           ≥5 shots incl. ≥1 b-roll + cover frame
caption_packet        quantified spec for a renderer that does not exist
publish_plan[]        one entry per platform in the founder's DNA
```

**Should also happen and doesn't:** intent = `explain/sell` should force the pricing claim
to be grounded in Twin's real pricing page (knowledge layer), and Hormozi's cut density
should set the editor's target — neither is possible today.

### Scenario 2 — Tech reviewer; reference = MKBHD phone review

| Element | Copied? |
|---|---|
| Review structure | ✅ — the beat order from MKBHD's transcript is the strongest transfer |
| Pacing | ⚠️ measured (`words_per_min`) but never enforced as a target |
| Humour | ⛔ — register is not an extracted attribute |
| Examples | ⛔ — banned, replaced from creator DNA |
| Editing | ⛔ — never extracted, never transferred, and would not reach the editor even if it were |
| Camera work | ⛔ — MKBHD's frames are never decoded |

**Original:** every spoken word, every example, the specific product angle, all packaging.
**And every spec and benchmark number is model recall** — for a review, that is the
category's core risk and Twin has no defence.

### Scenario 3 — Tech reviewer; reference = fitness creator on protein

**Transfers:** story structure (beats), hook shape, CTA shape, retention tactics, wpm.
**Does not transfer:** energy (not extracted), captions (not extracted), editing (not
extracted), and — correctly — every noun.

**How Twin converts the structure:** `concept.premise` is required to adapt **one of the
creator's own `formats[]`** to the reference's *winning mechanism*, and
`concept.translations` makes the mapping explicit. So "3 protein myths that waste your
money" becomes "3 spec-sheet myths that waste your upgrade budget" — same skeleton, same
retention beats, entirely different domain. Cross-domain is where the doctrine is
strongest, because there is no content to leak.

**Should not transfer** and currently cannot: the fitness creator's shooting style, gym
b-roll, high-energy delivery if the reviewer's DNA is measured. The DNA's `tone`/`pacing`
correctly win, because the reference contributes no register signal at all.

### Scenario 4 — Skincare brand; reference = MrBeast challenge

**Survives:** the escalation beat structure, the countdown/stakes *mechanism* as described
in `beats[].goal`, the hook shape, the re-hook at 40%.
**Disappears:** production scale, cast, locations, graphics, sound design — all of it,
because `your_scale` is a required field that must state "plainly and honestly how ONE
person with a phone achieves the SAME effect."

**High energy?** Only if the brand's `tone`/`pacing` DNA already says so, or the user picks
`tone: punchy`. The reference's energy is not measured, so it cannot force it.
**Countdown / tension / pacing?** As *script devices* (a beat that says "countdown timer on
screen"), never as *edit instructions* — nothing renders a countdown.

**What Twin should do and doesn't:** flag that the reference requires production the
creator's capability profile doesn't include, and require the user to accept the
translation before spending a credit.

### Scenario 5 — Finance educator; reference = cooking tutorial

**Transforms via:** the tutorial's step-sequence beats → a finance step-sequence
(`translations`: theirs "add the butter at exactly 60°C" → yours "make the transfer on the
day the statement closes"). **Remains:** step count, step ordering, the "here's the one
step everyone gets wrong" re-hook, the payoff-at-the-end shape.
**Changes:** every noun, the CTA target, the vocabulary, the stance.

This works well *because* the extraction is narrative-only — a cooking video's visuals
would be actively misleading to transfer, and Twin structurally cannot.

### Scenario 6 — SaaS founder; reference = travel vlog

**Can Twin reuse pacing?** The number exists (`words_per_min`); nothing enforces it.
**Storytelling?** Yes — `beats[]` gives the arrival→obstacle→discovery→reflection arc.
**Emotional progression?** Only implicitly, via `beats[].goal` prose. There is no emotion
model, so the arc is reconstructed by the writing model, not transferred as data.

**Without copying travel footage:** trivially, because footage was never available. The
honest framing is that Twin transfers a *narrative rhythm*, and the founder shoots a
talking head against it — which is fine for this pairing and is exactly what
`concept.translations` is for.

**What's missing:** a vlog's rhythm is 70% cut rhythm and 30% narration. Twin gets the 30%.

### Scenario 7 — Fashion brand; references = Hormozi + MKBHD + MrBeast + Ali Abdaal + Apple event

**Twin cannot accept this input.** One `reference_url` per generation. There is no
ranking, blending, averaging, dominance resolution or conflict detection — the feature
does not exist at any layer (UI, edge function, schema, prompt).

The algorithm it should have is specified in **Part 12** above: normalize each to a beat
skeleton → majority-vote structure → rank-weighted median for scalars → **dominant
reference wins for aesthetics** → emit a provenance map and a conflict list. For this
specific set, a correct engine would report the conflict rather than blend: Apple's
restraint and MrBeast's escalation cannot be averaged into anything coherent, and the
honest output is "pick your dominant reference; the others contribute beats only."

### Scenario 8 — New creator, no previous videos; reference = excellent educational creator

**Today:** `generate-blueprint` **refuses** if there is neither a voice profile nor quiz
DNA (`code: 'NO_VOICE'`, HTTP 409, *before* spending credits). So the creator must either
scan a handle or complete the manual voice form.

If they take the manual path, the DNA is thin and Twin fills it with explicit
*INFER instructions* rather than blanks — `povLine`, `enemyLine`, `hookPatternsLine`,
`formatsLine`, `titleStyleLine`, `thumbStyleLine` all become "NONE STORED. Infer …".
Plus `enrichVoiceProfile()` deterministically derives `hook_patterns` from
`sample_hooks` and `audience` from `niche`.

**So the split is roughly:** reference ≈ 55% of the structure, creator DNA ≈ 10% (mostly
niche), **AI invention ≈ 35%** — and the invention is honest but unverifiable. This is the
scenario where Twin most resembles a generic script generator, and where the output should
be labelled as a *starting hypothesis* rather than "your voice."

### Scenario 9 — Experienced creator, 300 videos; reference = completely different style

**Which system wins?** **Creator DNA, by construction.** The system prompt's FINAL CHECK
is: *"reread every hook and every script line against the CREATOR DNA… If any line could
belong to a generic creator in this niche, rewrite it until it is unmistakably this
creator's."* Reference owns only structure; DNA owns voice, examples, stance, CTA.
The user can shift this with `fidelity` (`loose` explicitly says "Prioritize the creator's
OWN angle… may diverge substantially from the reference's beats").

**How identity is protected:** three mechanisms — the structure/content doctrine, the
≥2-of-5-hooks vocabulary rule, and the final-check rewrite instruction.

**What is lost anyway:** those 300 videos exist only as a 22-field summary synthesized
from **20 captions**. A creator with 300 videos and a creator with 25 get the same depth
of DNA. There is no accumulation, no learning from performance, no memory of what they've
already made (so Twin will happily propose a video they made last month). That is the
real identity risk — not reference override, but *shallow* identity.

### Scenario 10 — Conflicting references (A: fast/loud/high-energy; B: slow/cinematic/minimal)

**Today:** impossible to express — one reference per generation. Two generations produce
two unrelated blueprints.

**What it should do** (and this is the design principle worth committing to):
**aesthetic attributes must never be averaged.** The midpoint of "fast, loud" and "slow,
cinematic" is not a style, it is mush. The correct resolution:

1. Detect the conflict explicitly (energy/pacing/transition-policy distance above a
   threshold).
2. Split by *attribute class*: structure can genuinely merge (both may share
   hook→proof→payoff); aesthetics cannot.
3. Assign **one dominant reference per aesthetic axis** — either by user pick or by
   distance to Creator DNA (a calm creator gets B's aesthetics regardless of ranking).
4. Surface the resolution to the user before generating: *"Structure from A, look and
   pacing from B — swap?"*
5. Never emit a blended result silently.

---

## Part 18. Idea-generation provenance

Re-stated per element, with today's origin and where it *should* come from.

| Element | Today | Should be |
|---|---|---|
| **Video ideas** | ❌ feature does not exist. Nearest: `discovery/` scrapes trending URLs per niche into the gallery. | `intent × creator.formats[] × knowledge_entities × content_gap(vs. creator history) × trend`, each idea carrying its source set |
| **Hooks** | Creator DNA (`hook_patterns`, `vocabulary`, `pov`, `enemy`, `sample_hooks`) fused with the reference's hook shape | Same, plus: which hook *pattern* historically performed best for this creator (requires performance memory, which doesn't exist) |
| **Titles** | Model, following inferred `title_style` | + the reference's real title (currently never fetched) + the creator's actual top-performing titles |
| **Analogies** | Pure generation, with a stock-metaphor ban | Retrieved from the creator's own prior content where possible; marked `reasoned` otherwise |
| **Statistics** | **Pure model recall — ungrounded** | **Retrieved with a source URI, or refused.** No middle ground. |
| **Stories** | Pure generation | Retrieved from the creator's own transcripts/posts — Twin discards the 20 scraped posts after synthesis; it should keep them |
| **Examples** | Generation, steered by DNA | Knowledge layer (products, features, customers) |
| **CTAs** | `recurring_ctas` + `offer` — **genuinely grounded** | Conditioned on intent |
| **Objections** | ❌ not modelled | Derived from `audience_pain` + knowledge-layer FAQ/reviews |
| **Product positioning** | One inferred `offer` string | A real product entity from the knowledge layer |

**The rule that should govern all of it:** an element may only assert a *fact* if its
provenance is `retrieved` or `creator`. `reasoned` output is fine for framing, structure
and analogy — never for a number, a spec, a price or a claim.

---

## Part 19. Boundary tests

For each: what Twin realistically does, what it must not promise, what it should request,
and how it should guide instead of failing silently.

**Note on current behaviour:** in *every* case below, Twin today produces a blueprint. It
has exactly one refusal (`NO_VOICE`, when there's no DNA at all). There is no capability
model, no asset check, no feasibility gate. **Silent over-promise is the default.**

| # | Scenario | Twin can realistically | Must never promise | Should request | Should guide by |
|---|---|---|---|---|---|
| 1 | **Dance video, has never danced** | Write a caption, a title and a hook. Nothing else — the editor is speech-driven and would produce an empty envelope. | Any edit, any beat-sync, any choreography | Nothing — this is a *refuse*, not a request | "Twin edits talking videos. For dance, we can write the hook and caption only." |
| 2 | **Travel vlog, no travel footage** | A narrated talking-head *about* travel | A vlog | Footage — which it cannot ingest (one source asset) | Offer the honest alternative format explicitly |
| 3 | **Product demo, no product** | A script describing a product it has never seen | A demo | Product images, a URL, a spec sheet, a screen recording | Block at plan time: "A demo needs the product. Add a link or images." |
| 4 | **References a documentary, uploads a selfie** | Transfer the documentary's *narrative* pacing to a single talking head — this is actually a legitimate and good outcome | Documentary look, archival, multi-cam, cinematic grade | Nothing extra — but say what transferred | Show the `translations` pairs prominently: this is exactly what that field is for |
| 5 | **References MrBeast, records a talking head** | The escalation structure + stakes framing, honestly downscaled via `your_scale` | Production, graphics, countdowns, cast | Nothing | Surface `your_scale` *before* generating, so expectations are set before the credit is spent |
| 6 | **Imitate five unrelated creators at once** | Nothing — the input shape is rejected | Any blend | One dominant reference + up to N structural contributors | "Pick the one whose *feel* you want. The others can contribute structure." |

**The systemic fix these all point to:** a **capability gate** between plan and generation —
a typed check of `(intent, required_assets, source_shape) × (what the creator has)` that
either proceeds, requests the missing asset, or declines with the nearest honest
alternative. Today that gate does not exist, so Twin's failure mode is not an error — it
is a confident, well-written plan for a video the user cannot make.

---

## What "make a video like this" actually means inside Twin — today

Precisely this, and nothing more:

> **The order and purpose of the spoken beats, the shape of the opening line, the shape of
> the closing ask, and the reasons a strategist would give for why those beats hold
> attention — extracted from the reference's transcript alone, then re-written entirely in
> the creator's inferred voice.**

It does **not** mean the editing, the pacing (as enforced behaviour), the visual
composition, the business strategy, or the production values. It partially means the
storytelling and the educational framework, insofar as those live in the narrative beats.

That is a coherent, defensible, *honest* definition — and it is a smaller definition than
the product currently implies. The roadmap that follows from this audit is not "more
editor features." It is, in order:

1. **Close the loop** — make `compiling`/`rendering` real, so a decision becomes a video.
2. **Decode the reference's video, not just its audio** — so "like this" includes rhythm.
3. **Carry the plan across the record boundary** — typed scene blueprints, not prose.
4. **Model intent explicitly** — so every downstream decision has something to condition on.
5. **Build the knowledge layer** — so claims can be grounded and business categories open up.
6. **Tag provenance on every generated element** — which turns Twin from an editor with AI
   into a decision engine that can explain itself.
