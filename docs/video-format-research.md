# What the outside sources actually say, and what they do not settle

Extracted 2026-08-23 via Apify at the owner's request, to inform labelling,
scripting, the teleprompter and editing.

⚠️ **NOTHING HERE IS WIRED INTO THE PRODUCT.** These are two vendor marketing
blogs. Their claims are opinions and category lists, not measurements of Twin.
The founding defect of this product is *voice-accurate, content-empty scripts*,
and injecting generic advice ("build connection", "use good lighting") into a
writer prompt is a direct way to make that worse. What follows is recorded so a
later decision can cite a source instead of a memory.

## Sources actually retrieved

| source | what it is |
|---|---|
| `synthesia.io/post/best-talking-head-video-examples` | 14 template categories + 4 filming tips. Vendor blog for an AI-avatar product. |
| `blings.io/blog/video/types-of-videos/` | 10-format taxonomy. Vendor blog for a personalisation platform. |

**NOT retrieved: the 10 YouTube videos and the 2 Instagram links.** The Apify
actor search returned the same generic popular-actor list for every query
("youtube transcript", "youtube", category-filtered) and never surfaced a
transcript actor. No YouTube or Instagram content was extracted, and none of the
findings below draw on those links. Saying "we researched 14 sources" would be
false; two were read.

## The one finding that changes a decision

Synthesia defines the format operationally:

> "the camera is usually positioned so that only the speaker's head and
> shoulders are visible to the viewer"

Twin's visual pass asks something **looser**. From `worker/src/visualPrompt.ts`:

    'performance.talkingHead': 'Is someone speaking to camera?'

A person speaking to camera from twenty metres away is **true** under Twin's
question and **false** under the industry definition. Both are defensible; they
are not the same field.

⚠️ **DO NOT FIX THIS BY REWORDING THE LABELLING CARD.** The reviewer's sentence
("Someone is talking straight to the camera.") tracks the question the model was
actually asked. Tightening the human's sentence alone would have the reviewer
judging a stricter claim than the model answered, and every resulting label would
record a mismatch as a model error. That was proposed and rejected while writing
this note.

Changing the FIELD is a real option, and it costs:
- a new analyzer version, because the field's meaning changes
- existing `visual_profile` rows become incomparable with new ones
- it is a measurement decision, not a wording tweak

**Open, for the owner:** should `talkingHead` mean "speaking to camera" (today)
or "head-and-shoulders framing" (the industry term)? The pilot's own evidence
does not settle it — Twin answered `false` on all 8 references and the owner
agreed by eye, so the two definitions did not disagree on this sample.

## The format taxonomy, as candidate vocabulary for `primaryMode`

`primaryMode` was **unanswered on 8 of 8** references in run 7204de6f — the only
field the model never once answered. Its current options are `talking_head`,
`demonstration`, `skit`, `voiceover`, `montage`.

Blings lists ten formats: talking head · interview · animated · mixed media ·
screencast · text overlay · live stream · interactive · 360-degree · testimonial.

⚖️ **THIS IS NOT AN ARGUMENT TO ADD SEVEN OPTIONS.** A field the model never
answers is more likely under-specified than under-optioned, and widening the enum
before knowing why it abstains would turn one unanswered field into one unanswered
field with more ways to abstain. The overlap worth considering is narrow:
`interview` and `text overlay` are common on short-form social and have no home in
the current five. `360-degree`, `live stream` and `interactive` do not apply to a
reference video at all.

## A datapoint that corrects something I said earlier

Blings, citing Digiday:

> "Up to 85% of Facebook videos are viewed without sound."

This is the stated rationale for text-overlay as a distinct format. It matters
here because it cuts against a framing used earlier in this session: silent video
is a **legitimate format**, not junk footage. The problem with the first pilot's
cohort was never that silent video is worthless — it is that a cohort drawn
ENTIRELY from silent video cannot exercise the `content_beats` arm, because a
silent reference has no content profile to take beats from. That is a sampling
defect, not a judgement about the content.

## A tension worth naming, not acting on

Synthesia's filming tip #4:

> "ensure you don't hold the same angle for an extended time. On the flip side,
> when your presenter is delivering key messages, it's best to keep the camera
> angle steady to avoid distraction."

Twin's compiler anchors zooms on emphasis words — `reasonCode: 'emphasis_word'`
in `editorCompile.ts`. If the advice above is right, that is backwards: the zoom
lands exactly where the advice says to hold steady.

⚠️ **THIS IS A BLOG OPINION, NOT EVIDENCE, AND IT IS NOT A REASON TO CHANGE THE
RENDERER.** It is the kind of claim the #57 cut-review queue exists to settle
with real human judgement on real cuts. Recorded as a hypothesis with a named
source so it can be tested rather than argued.

## What none of this supports

- No change to the writer or teleprompter prompts. Neither source contains
  operational writing guidance; both contain category lists and production tips.
  "Use an external microphone" is true and has nothing to do with what Twin
  writes.
- No change to the labelling vocabulary. See above.
- No change to zoom placement. See above.
