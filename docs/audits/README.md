# Audit documents

Source material for the "fix #N" references used by the build-loop routines. Each
file is a verbatim text extraction of an uploaded PDF, committed so the routines
have a real document to read instead of a filename nobody can resolve.

- **`unblock-instructions.md`** — start here. Resolves the missing-PDF blocker,
  corrects two prior audit findings (G3 brand-truth, G8 part 2 "ask queue"), and
  gives the prerequisite-ordered build list.
- **`scripting-deep-audit.md`** — line-by-line audit of a real generated script,
  plus a pipeline audit (onboarding → DNA → writer) and 7 creator-persona
  simulations. Source for the persona-driven findings (placeholder beats, single
  filming location, hook length, faceless-creator support, etc.).
- **`scripting-fix-specs.md`** — one numbered `FIX N` spec per issue found in the
  deep audit: root cause, data model, prompt/code changes, checks, and the
  metric that proves each one worked. This is the document the "15-fix build
  loop" routine's `FIX 1`–`FIX 15` references resolve against.
- **`full-system-audit-and-build-plan.md`** — broader scope than the scripting
  audits: the full core loop across onboarding, DNA, product, recording, and
  editor, with evidence cited from the codebase, migrations, and production
  logs.

## Two documents referenced earlier in this session that are NOT here

Two audits — "Product DNA → Writer Decisions → Script (Full Path Audit)" and
"Why Twin's Scripts Sound 'AI' — Voice & Creativity Audit" — were read and
worked from earlier in this engineering session (the G1–G8 and Voice-Cause
items, PRs #566–#576). Their content is not present as a separate uploaded
file in this session and could not be committed verbatim here without
reconstructing it from memory, which would not be a faithful copy. If those
two documents exist as files elsewhere, add them here under names matching
this directory's convention (e.g. `product-dna-writer-path-audit.md`,
`voice-creativity-audit.md`) so future "fix #N" references from them resolve
the same way.
