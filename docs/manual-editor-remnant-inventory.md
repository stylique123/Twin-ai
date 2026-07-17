# Manual / Timeline Editor Remnant Inventory

Branch: `rebuild/remove-manual-editor-remnants` · Base: `cc41395` (post Part-1 removal).

Focused discovery + cleanup pass run **before** building the new one-click editor,
to prove no incomplete manual editor, timeline editor, Refine workflow, EDL
workflow, alternate rerender path, or editing-oriented scene timeline remains.

## Bottom line

The executable manual/AI/timeline/Refine/EDL editor was **already fully removed**
in Part 1. This pass found **no dormant, renamed, commented, feature-flagged, or
unlinked manual-editor code** in live source, no manual-editor DB runtime objects,
and no manual-editor routes. The only actions taken were small, in-scope hardening:
slimming the recording model to be recording-only, closing a residual DB write
grant, and doc/guard/test tightening.

## What was found (classified)

| Area | Finding | Classification | Action |
| --- | --- | --- | --- |
| Worker `edit.ts`/`director.ts`/`edl.ts`/`broll.ts`/`timeline.ts`/`jobs/autoedit.ts` + editor Python | absent | already removed (Part 1) | none |
| `revideo/`, `supabase/functions/enqueue-autoedit/` | absent (fn = 410 tombstone) | already removed (Part 1) | none |
| UI: Refine panel / timeline / track / waveform / playhead / trim / split / merge / rerender controls | **none exist** (grep + component glob `*Refine*/*Timeline*/*Editor*/*Track*/*Waveform*/*Playhead*` → no files) | already removed | none |
| Routes (`App.tsx`) | no editor/Refine/timeline route; legacy `/v2/plan\|capture\|review/:id` are redirects to Result/record | RETAIN-ACTIVE | none |
| Shared `api.ts`/`capture.ts` | `autoEditTake`/`autoEditFromPath`/`reEditWithEdl`/`fetchEdl`/`pollEditJob`/`EditDecisionList` absent | already removed | none |
| `Scene`/Scene Timeline (`timeline.ts`, `timelineAdapter.ts`) | carried editor-descriptive fields `broll_instruction`/`cut_point`/`transition` (written by `buildTimeline`, read by nothing) | REMOVE (mixed-responsibility) | **removed those 3 fields → recording-only model** |
| `updateGenerationChoice(edit_style)` (shared `api.ts`) | accepted `edit_style` (old-editor field) as a legacy passthrough; no caller used it | REMOVE | **removed `edit_style` from the param** |
| DB grant: `authenticated` UPDATE(`edit_style`) | live residual manual-editor write path | REMOVE | **revoked (migration 0074)** |
| DB grant: `anon` table-level UPDATE on `generations` | inert (RLS `workspace_peers()` empty for anon) but over-broad | REMOVE (defence in depth) | **revoked (migration 0074)** |
| `generations.edit_style` (1→2 rows), `edl_path` (1 row) columns | legacy data | RETAIN-LEGACY-DATA | kept (no drop); writes now blocked |
| `generations.scene_timeline` (0 rows), `edit_path` (10), `take_path` (6), `selected_hook` (18) | recording/playback data | RETAIN-ACTIVE / LEGACY-DATA | kept |
| `README.md` "RefinePanel" mention | stale doc string (no such file) | REMOVE | **fixed** |
| `supabase/migrations/*` editor comments | immutable history | RETAIN-IMMUTABLE-MIGRATION | none |
| `pr-checks.yml` guard strings | intentional | RETAIN-CI-GUARD | **extended** with `fetchEdl\|reEditWithEdl\|EditDecisionList\|ManualEditor\|TimelineEditor\|RefineEditor\|manual-rerender` (NOT bare `timeline`) |
| `.trim()`, CSS `keyframes`, `.split()`, "merge" (voice fields), whisper "caption timing"/"refine" | unrelated | FALSE-POSITIVE | none |

## Recording vs editing data boundary (Stage 2.3)

`scene_timeline` (jsonb, **0/32 rows populated** — synthesized in-memory) now holds a
`SceneTimeline` whose `Scene` is recording-only: `scene_number`, `scene_type`,
`purpose`, `dialogue`, `duration_sec`, `camera_framing`, `background`, `movement`,
`caption_text` (on-screen text hint, no timing/style), `pause_after`,
`show_in_teleprompter`. The render fields `broll_instruction`/`cut_point`/`transition`
were removed. It contains no render cuts, caption events, zoom/music events, output
timestamps, ffmpeg filters, or EDL data. The rebuilt one-click editor will own its
own edit plan, separate from this recording model.

## DB column deprecation facts (Stage 4, before any future drop)

| Column | non-null rows / 32 | writers now | readers | drop when |
| --- | --- | --- | --- | --- |
| `edit_style` | 2 | none (grant revoked) | none | future data-retention migration |
| `edl_path` | 1 | none (grant revoked) | none | future data-retention migration |
| `scene_timeline` | 0 | none (no grant) | teleprompter (when present) | may keep for recording persistence |
| `edit_path` | 10 | new editor (Part 2) | Result/History/Dashboard/review | never (playback) |
| `take_path` | 6 | recorder | Result raw-take player | never (recording) |
| `selected_hook` | 18 | recorder | teleprompter/blueprint | never (recording) |

No column dropped in this pass (populated columns require a separate approved migration).

## Not done here (needs a staging session — same as Part 1)

Authenticated end-to-end runs (DNA→profile, blueprint→hook, record→one upload→refresh
recovery, existing-asset publishing), live cross-user media-denial with two sessions.
These are documented in `docs/ai-editor-rebuild-status.md`.
