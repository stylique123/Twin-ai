# TwinAI — Writer Voice & Creativity Audit

_Source: uploaded PDF, committed verbatim (text-extracted). This is the Voice & Creativity audit referenced earlier in this session (Voice Cause 1-3, Creativity items) whose source file was previously unavailable._

---

Why Twin’s Scripts Sound “AI” — Voice & Creativity
Audit
Question asked: does the writer actually receive the creator DNA and product DNA,
and why does the output still read like AI copywriting instead of a top-tier creator?
Method: read the live prompt-assembly code (the CREATOR DNA block, the style
compiler, the knowledge/evidence/community blocks) and traced what a real creator’s
generation actually carries.
1. First, the verdict on “is the DNA received properly?”
The pipes are real and verified. The supply is thin. The AI-ness comes from what
happens when supply is thin.
What the writer genuinely receives today (verified in the prompt assembly, not the docs):
Signal Wired? Quality in practice
Niche, sub-niche, audience,
pain, dream, offer, goal
Good when brief answered;
“NONE STORED → infer”
otherwise
Tone/voice adjective
An adjective — the style
compiler’s own comment calls
adjectives “agreeable” , not
executable
Hook formula, hook patterns,
their real winning hooks
Real when scanned deep;
fallback = “build 5 generic
opener moves”
Their video formats, title style,
thumbnail style
 Same: real or “infer from niche”
Signature vocabulary, recurring
CTAs, POV, enemy, dos/don’ts
Model-derived at scan time;
quality never measured
Verbatim speech samples
(“match this EXACT cadence… The strongest voice signal in the

weight above every other
signal”)
system — present only for
transcript-rich creators
Measured style card (median
sentence length, %you,
%questions, contractions,
opener type)
Renders NOTHING below 40
sentences of recorded speech
Knowledge (10 selected items,
substance floor)
 The proven quality lever
Product DNA: evidence captures,
community map, claim rules,
forbidden phrases
 (guard-tested
end to end, incl.
#535’s parity
checks)
Supply-limited: Product Library
~empty, suggestion-claims skip
the capability question
Reference container shape (beat
template from the transcript
pass)
Only for assessed references —
still almost none
So your instinct is half right in an important way: nothing is broken in transmission — but
for the majority creator (thin scan, caption-heavy, brief half-answered), most of these
lines literally read “NONE STORED. Infer… ”. The writer is instructed to sound like a
specific person while being handed permission to guess nearly everything about them.
What a large language model infers, absent evidence, is the average of the internet — which
is exactly the “AI language” you’re hearing. The AI-ness is not a style bug; it is the sound of
missing supply.
2. The three specific causes of AI-sounding output, in order of
impact
Cause 1 — The voice evidence cliff (biggest)
The two strongest voice signals — verbatim samples and the measured style card — both
vanish for thin creators, and the style card’s 40-sentence floor is correct honesty (a style
profile computed from 3 sentences would be confident nonsense) but there is no fallback
voice contract. Below the cliff the only voice instruction left is a tone adjective. Result:
scripts written in fluent, symmetrical, well-organized model-default English — grammatically
perfect, rhythmically dead.

Fix (input-side, the lever this repo has proven works):
A default short-form register card whenever the measured card can’t render — not a
fake profile of them, but honest genre mechanics: “No measured style exists for this
creator yet. Default register: median sentence ≤9 words, ≥60% sentences address ‘you’ ,
≥1 contraction per sentence, fragments allowed, one idea per sentence, no parallel
triads.” Labeled as genre default, never as their voice — the same honesty pattern as
everything else.
Feed the ask-answers and story-interview answers into voiceSamples. Those are
verbatim creator words already in the store (source: 'asked', stated basis) and today
they enter only as knowledge, not as voice evidence. Three interview answers ≈ 10-20
sentences of true first-person voice on day one — halfway to the 40-sentence floor
before a single video is transcribed.
Lower the cliff gradually, honestly: between ~15 and 40 sentences, render a partial
card with only the metrics that are stable at that n (sentence length and second-person
share stabilize early; opener type doesn’t), each line labeled with its sample size.
Cause 2 — No anti-AI-diction contract
The system already fights two AI tells — em/en dashes (banned in FINAL CHECK) and stock
phrases (#550’s phrase lint, correctly false-positive-tested). But the modern AI-tell lexicon
and syntax are unaddressed: “delve” , “dive into” , “unlock” , “elevate” , “game-changing” , “in
today’s fast-paced world” , “here’s the thing” , “let’s be real” , the “It’s not just X — it’s Y”
construction, perfect three-item parallel lists, every sentence the same shape. Humans —
especially good creators — speak in asymmetry: fragments, restarts, one long sentence
then three short ones.
Fix, in the house style (measure → narrow → check, never a vibe):
1. Run the #550 methodology again on a candidate AI-tell list against the existing
production corpus (463+ lines): keep only phrases with real hit-rates and near-zero
false positives. Phrase-level, never word-level — the “hustle” lesson.
2. Add two decidable syntax checks, advisory notes not verdicts: (a) parallel-triad detector
— three consecutive clauses of matching shape in one spoken line; (b) uniformity
detector — a script whose sentence-length variance is far below the creator’s measured
(or default-register) variance. Both computable, both note-only, both feed the same
span-rewrite affordance.
3. The strongest lever remains upstream: when verbatim samples exist, they already
outrank everything by instruction. The two fixes in Cause 1 put samples in front of far
more generations — the diction problem shrinks as a side effect.

Cause 3 — “Signature vocabulary” is asserted, not extracted
The prompt leans hard on “their signature vocabulary” and “their exact hook FORMULA” —
but that vocabulary list is whatever the scan-time model summarized, never measured. A
creator’s actual catchphrases are sitting in their transcripts as literally countable repeated
phrases.
Fix: deterministic n-gram extraction over their transcripts (2-4-word phrases appearing in
≥3 different videos, stopword-filtered, capped at ~10) → a measured “PHRASES THEY
ACTUALLY REPEAT” line in the DNA block, alongside (not replacing) the model-derived list.
Cheap, honest, and testable — and it gives the “AT LEAST TWO hooks must reuse signature
vocabulary” rule something real to be checked against, which today it can’t be because the
vocabulary itself is unverified.
3. The creativity ceiling — writing like a high-class creator, for
views
Everything above removes AI-ness. It doesn’t add brilliance. Honest framing first: this repo’s
own experiments showed prompt exhortations (“be creative” , “avoid repetition”) measure as
inert — so the creativity plan must be structural, not adjectival:
1. Named creative moves as schema, not vibes. Add an optional creative_moves field:
the writer picks up to 2 from a small named library — callback (plant a phrase in the
hook, pay it off in the CTA), running bit, smash-cut confession, prop metaphor, cold-
open mid-action, fake-out (“the answer isn’t what you think — it’s worse”). Decidable
presence check; the panel judges whether they helped. This converts “be creative” into
a choice among concrete, testable devices — the same trick that made substance
checkable.
2. Exemplars over instructions. The single most reliable way to raise a model’s creative
register is showing it excellent instances. The assessed-reference pipeline (once the
gallery fix stocks it) yields transcripts of proven viral scripts in the creator’s niche —
inject the 2 best-matching assessed hooks/openers as “hooks that won in this niche this
quarter (study the move, never the words)” . Input-side, honest, and it compounds as the
library grows.
3. The callback is the cheapest 10x device and it’s checkable: hook plants a concrete
word/image → CTA reuses it. One schema field (callback_token), one post-parse
containment check. Callbacks are disproportionately common in top-performing shorts
because they reward full watch — the retention doctrine already wants this and just
never named it.

4. Measure “AI-ness” the way everything else here gets measured: add one question
to the existing blind creator panel — “Does this read like a person or like AI?” — scored
before/after Causes 1-3 ship. If the panel can’t tell the difference, the fixes didn’t work,
whatever the checks say. The panel is the arbiter; the checks are the plumbing.
4. Sequenced (smallest first, all input-side or decidable)
# Change Size
1 Ask/interview answers flow into voiceSamples ~1 day
2 Default register card below the style floor (+ partial card 15-
40) ~1-2 days
3 Measured n-gram catchphrase line in DNA ~1-2 days
4 AI-tell phrase tier measured against corpus, then added to
the existing lint
~1 day measure +
~0.5 wire
5 Callback token + check ~1 day
6 Parallel-triad + uniformity advisory notes ~1-2 days
7 creative_moves field + presence check ~1 day
8 Niche exemplar injection (depends on gallery assess-on-
ingest) rides the gallery build
9 Panel question: person-or-AI, before/after next panel run
None of these touch the honesty architecture; every one either adds true supply, converts a
vibe into a check, or measures the thing being claimed. The through-line: the writer was
never too dumb — it has been under-fed, and it fills silence with the internet’s average
voice. Feed it the creator’s real words, ban the model’s tells, give creativity named
handles, and let the panel keep score.