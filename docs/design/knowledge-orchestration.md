# Knowledge orchestration — when to use what

Owner brief, 2026-10-04: *"a whole system — when to use which part, how to attach
each part to each, how to make a complete story out of every combination … in
every mode, every option, every angle."*

Today every source reaches the writer as its own block with its own loose rule,
and nothing decides **which source feeds which part of the video**. The result
(batch part-7): 1 line in 4 has no source, the niche brain / Reddit / research
never trace to a line, and the reviewer's top complaint is "generic".

This document is the single grid. Code: `packages/shared/src/script/knowledgeRouter.ts`.

## 1. The sources, by whose truth they are

| Source | Id | Whose | May state as fact? | Good for |
|---|---|---|---|---|
| Her stories / experiences / examples | `her_story` | hers | yes | story, proof, payoff |
| Her opinions, claims, frameworks | `her_claim` | hers | yes, at her level | turn, teach steps, contrarian hook |
| Her answers on this build + her note | `her_answers` | hers | yes | spine of an idea video, any slot |
| Her viewers' questions (comment mining) | `her_viewers` | her audience | as "people ask me" | hook, question, close |
| The product (pages + what she typed) | `product` | hers / vendor | exact facts only | proof, demo, offer, close |
| Her brand | `brand` | hers | confirmed only | brand videos, sign-off |
| Voice / DNA, lessons, track record | `voice` | hers | never a claim | how every line sounds, hook style, length |
| Niche brain: hook / angle patterns | `niche_hook` | the niche | never | the SHAPE of the hook and argument |
| Niche brain: proof shots | `niche_proof` | the niche | never | what to SHOW in proof beats |
| Niche brain + comments: objections | `niche_objection` | the niche | never | the objection a sell video pre-empts |
| Reddit: questions | `reddit_question` | the audience | as "people ask" | hook, setup |
| Reddit: complaints | `reddit_complaint` | the audience | as "people hate" | setup (the pain) |
| Reddit: buying asks | `reddit_buying` | the audience | as "people ask what to buy" | sell hook, comparison |
| Reddit: debates | `reddit_debate` | the audience | as "people argue" | contrarian hook, comment close |
| Reddit: phrases | `reddit_phrase` | the audience | words only | wording of hook and setup |
| Google research: news / launches / dates / competitors | `research` | the world | only as public news | timely hook, curiosity |
| Today's moments, rising trends | `moment` | the world | only if it fits | timely hook |
| Reference video | `reference` | someone else | never | order and rhythm of the roles |

Rule zero (unchanged, now enforced per slot): **only hers may be stated as a
fact about her or her product.** Everyone else's knowledge decides what to say
*to* the audience and how; she supplies what is *said*.

## 2. The roles every video is built from

`hook → setup → proof → turn → payoff → close`, plus the outputs around the
script: `angle options`, `questions to her`, `hook options`, `shots`,
`title / caption / thumbnail`, `cta`. A row may merge roles (a 4-beat answer
video has hook, setup, payoff, close).

## 3. The grid: for each arc row, which source fills each role (first that has material wins)

| Role | sell | teach | story | answer | entertain |
|---|---|---|---|---|---|
| **hook** | reddit_buying · niche_objection · reddit_question · her_viewers | reddit_question · her_viewers · her_claim (misconception) · research | her_story (the moment it went wrong) · reddit_complaint | her_viewers · reddit_question · reddit_debate | reddit_debate · reddit_phrase · moment · her_story |
| **setup** | reddit_complaint · niche_objection · her_story | reddit_complaint · reddit_question | her_story | reddit_question · reddit_complaint | reddit_phrase · her_story |
| **proof** | product (+ shown) · her_story · niche_proof (what to show) | her_claim (framework) · her_story · product as the tool | her_story | her_claim · her_story · product if it answers | her_story · niche_proof |
| **turn** | niche_objection answered by her_claim | her_claim | her_claim (what she learned) | reddit_debate answered by her_claim | her_story twist |
| **payoff** | product does it (shown) · her result | her_claim (the step that matters) | product as the result of the story · her_claim | her answer, plainly | the punchline from her_story |
| **close** | her CTA → offer | takeaway · save | follow · her CTA | a question from reddit_debate / her_viewers | follow / share |

**Shape sources run alongside every role:** `voice` (always), `niche_hook`
(hook shape and argument order), `reference` (role order and rhythm when the
mode is reference).

## 4. Settings move the grid; they never replace it

- **Mode**
  - *idea*: `her_answers` (her paragraph) is the spine; every role prefers it first.
  - *product*: `product` is required in proof or payoff, and is shown.
  - *brand*: `brand` replaces `product`.
  - *reference*: `reference` sets role ORDER and pacing; `reference_use` decides how close (structure / pacing / idea_structure / stay_close). Content still comes from her.
- **Goal → row** (arcShape `ROW_OF_GOAL`): sell/leads/launch→sell, educate/authority→teach, personal_brand→story, conversations→answer, entertain/followers→entertain.
- **Angle** (it wins the row, arcShape `ROW_OF_ANGLE`, and picks the hook source):
  - contrarian_claim → hook from `reddit_debate` / her misconception claim;
  - problem_question → hook from `reddit_question` / `her_viewers`;
  - result_first → hook from her result (`her_story` / `product` payoff), told first;
  - feeling_story → story row, hook from `her_story`;
  - teach_list → teach row, proof is her steps;
  - curiosity → hook from `research` / `moment` / a surprising fact of hers.
- **Focus** re-orders the proof role:
  - expertise → her_claim;
  - experience / story → her_story;
  - opinion → her_claim + reddit_debate;
  - review → product + reddit_buying;
  - product → product.
- **Outcome** sets the close:
  - comment → question;
  - share / follow → follow / save;
  - learn → takeaway;
  - convert / check_out_offer → offer;
  - change_mind → the turn must flip a reddit_debate side;
  - remember_me → sign-off in her phrase.
- **Tone** changes wording only, never sources.
- **Answer richness** (rich / short / none): rich → her_answers fill first; none → audience and niche sources carry the hook and setup, and her facts still own proof.

## 5. Gaps: fill, ask, or drop — never invent

For each role, in order:
1. The first source in the grid that has material fills it.
2. If a **required** role (proof in product mode, story in story row) has no material of hers, ask her ONE question for it (the existing readiness question path).
3. If no question can be asked, use the next allowed source *for that role's job*. An audience question can open a video; it can never be proof.
4. If nothing is allowed, drop the beat (the existing "required beat with no fact is dropped" rule).

## 6. Every output, not just the script

| Output | Primary sources |
|---|---|
| Angle options | reddit (debate → contrarian, question → problem_question), her_story (feeling_story), research/moment (curiosity), her track record (what wins for her) |
| Questions to her | the grid's empty required roles (§5.2) |
| Hook options (3) | three different hook sources from the row's hook list, one per option |
| Shots | proof/payoff: product show (shape) or screen; niche_proof for what the niche shows |
| Title / caption | reddit_phrase + niche vocabulary for words; her hook for the promise |
| Thumbnail | the payoff's visual + her style |
| CTA | her CTA; goal fallback |

## 7. Measurement

- **Line tracing:** every line names its board slot and source (lineSources gains niche, reddit, research, comment kinds).
- **Reviewer brain-use scores:** hook used a real audience signal; proof is hers; the story is complete across hook → payoff → close; no slot filled by a source that may not fill it.
- **Matrix runs:** mode × goal × angle × focus × outcome × answer-richness, about 20 per round, paced.
