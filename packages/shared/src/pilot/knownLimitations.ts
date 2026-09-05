// A LIMITATION NOBODY HAS WRITTEN DOWN BECOMES THE DESIGN.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// Deciding "not now, revisit later" is a reasonable call and a fragile one. The
// decision lives in a conversation, the conversation ends, and six weeks later
// the loose definition is simply what the field means -- not because anyone
// chose that, but because nobody wrote down that a choice was still open.
//
// ⚠️ SO A DEFERRAL IS A RECORD WITH A TRIGGER, NOT A COMMENT. Each entry says
// what is wrong, what was decided, and THE CONDITION UNDER WHICH IT MUST BE
// REVISITED. A test pins the open ones, so closing one is a deliberate edit
// somebody reviews rather than a thing that quietly stops being true.
//
// ⚖️ AND THE COST IS RECORDED HONESTLY. "Cheap to fix later" is the sentence
// that turns a deferral into a permanent state. If revisiting costs an analyzer
// version and a re-analysis, that belongs here, where the person deciding can
// see it.

export type LimitationStatus = 'OPEN' | 'RESOLVED'

export interface KnownLimitation {
  id: string
  /** What is actually wrong, in the terms a reader needs to judge it. */
  what: string
  /** What was decided, and why the obvious alternative was not taken. */
  decision: string
  /** The condition that must re-open this. Not a date -- a state of the world. */
  revisitWhen: string
  /** What revisiting actually costs. Understating this is how a deferral sticks. */
  cost: string
  status: LimitationStatus
}

export const KNOWN_LIMITATIONS: readonly KnownLimitation[] = Object.freeze([
  Object.freeze({
    id: 'TALKINGHEAD_LOOSER_THAN_INDUSTRY',
    what:
      "The visual pass asks 'Is someone speaking to camera?' (worker/src/visualPrompt.ts, "
      + 'FIELD_QUESTIONS) with no framing requirement. The industry definition of a '
      + "talking-head shot is stricter: the camera is positioned so only the speaker's head "
      + 'and shoulders are visible. A wide shot of someone addressing the camera from twenty '
      + "metres satisfies Twin's question and fails the industry one.",
    decision:
      'Keep the loose definition through the current visual pilot, and say so on the card: '
      + '"They do not have to be close up." Tightening the reviewer-facing sentence WITHOUT '
      + 'changing the question the model was asked would have the reviewer judging a stricter '
      + 'claim than the model answered, and every resulting label would record that gap as a '
      + 'MODEL error. That corrupts the measurement via a change that reads as an improvement. '
      + 'It was drafted, then rejected.',
    revisitWhen:
      'The first visual pilot run reaches LOCKED. Tightening mid-measurement is the expensive '
      + 'mistake; tightening between cohorts is cheap and comparability is already broken by '
      + 'the cohort change anyway.',
    cost:
      'An analyzer version bump. VISUAL_ANALYSIS_VERSION is stamped on every row as '
      + 'visualVersion AND feeds componentDigest(), so changing the question set without '
      + 'bumping makes old and new rows indistinguishable and yields the same digest for '
      + 'different content. Also: a shotType field added now is NOT retroactive -- references '
      + 'already analysed under visual-2 carry no shotType, and re-running frame analysis on a '
      + 'live pilot is not permitted. The payoff lands on the NEXT cohort.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'PILOT_COHORT_IS_NOT_THE_PRODUCT_PATH',
    what:
      'The first visual pilot cohort was drawn from no_speech references ONLY. In practice that '
      + 'selects montage and B-roll -- aerial festival footage, cut sequences with no presenter -- '
      + 'and not the talking-head creator videos the product exists to remake. Two consequences '
      + 'were measured on run 7204de6f before any labelling: performance.talkingHead and '
      + 'performance.screenInteraction came back false on 8 of 8 references with NO VARIATION (16 '
      + 'claims that cannot discriminate anything), and because content_beats cannot appear in a '
      + 'no_speech draw, armComparison will report NOT RUN rather than a comparison. The owner met '
      + 'it directly at claim 13, asked whether "filming this would only need one location" about a '
      + 'drone montage, and said they did not know how to answer.',
    decision:
      'Label and complete this run anyway. Its labels are still evidence -- they measure how well '
      + 'the visual pass reads B-roll, which is a real question -- but they DO NOT measure the '
      + 'product path, and no report from this run may be read as if they did. The reviewer is told '
      + 'to answer "these frames cannot settle it" rather than guess when a montage genuinely '
      + 'cannot be judged from the cited frames; a forced guess is worse than a recorded '
      + 'non-answer, because it is indistinguishable from a real judgement afterwards.',
    revisitWhen:
      'The with-speech cohort is drawn (#475 ships the selection; the draw itself is the owner\'s '
      + 'Start button). That cohort is what measures the product path, and the two runs must be '
      + 'reported separately rather than pooled.',
    cost:
      'A fresh run: a new cohort, a new frame-analysis pass, and a second round of labelling. '
      + 'It cannot be recovered from run 7204de6f by re-analysis -- re-running frame analysis on a '
      + 'live pilot is not permitted, and re-drawing would discard the labels already given. '
      + 'Pooling the two cohorts to save a round would hide exactly the difference being measured.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'ANIMATED_REFERENCES_ARE_OUT_OF_SCOPE',
    what:
      'An illustrated mouse in the first pilot cohort raised a question the field set had no '
      + 'answer for: does a drawn character count as a person, and is an animated figure acting? '
      + 'Two of the seven sharpenings in #489 exist because of it -- performance.acting was taught '
      + '"drawings and animation are not a person acting" and people.count was taught "drawn or '
      + 'animated characters are not people on camera". Those questions now EXCLUDE animation, but '
      + 'nothing recorded whether excluding it was the intent or an accident of wording, and the '
      + 'talking-head gate shipped a third exclusion on top: judgeFit returns does_not_fit with '
      + 'reason ANIMATED before it looks at anything else.',
    decision:
      'CLOSED, and closed as a NO rather than deferred: Twin\'s visual pass is about filmed '
      + 'people, and animation is recognised only in order to be excluded. Twin learns how a '
      + 'PERSON talks and hands it back as a script somebody performs; a cartoon has no performer '
      + 'to learn from, so a correct description of one still produces nothing a creator can act '
      + 'on. Teaching the field set to read drawings would also mean giving every field a second '
      + 'meaning -- what is a wide shot of a drawn scene, does a cartoon hold a product -- and each '
      + 'second meaning is another chance for the reviewer and the model to answer different '
      + 'questions, which is the gap that put run 7204de6f at 0.728 rather than higher. The owner '
      + 'was given the case for and against and answered "a hard no to cartoons, close the '
      + 'question".',
    revisitWhen:
      'The talking_head_overrides log (migration 0166) shows creators repeatedly overriding an '
      + 'ANIMATED warning AND keeping the scripts that result. That is the only evidence that would '
      + 'show the exclusion costs real creators something, and it is now recorded rather than '
      + 'guessable. ⚠️ AND THE ANSWER WOULD STILL PROBABLY NOT BE "describe cartoons": a creator '
      + 'who posts animation with a voiceover has a voice worth learning from their SPEECH, so the '
      + 'cheaper feature is to skip the visual pass for them, not to teach it to read drawings.',
    cost:
      'Reopening is not a wording change. Every VISUAL_FIELD would need a defined meaning for '
      + 'drawn footage, the seven sharpenings from #489 would have to be re-argued against it, and '
      + 'VISUAL_ANALYSIS_VERSION would have to move again -- which makes every visual-3 row '
      + 'incomparable with what came after. A cohort drawn to measure it would be a third run.',
    status: 'RESOLVED',
  }),
  Object.freeze({
    id: 'THE_CLAIM_STOP_IS_DECLARED_BUT_NOT_ENFORCED',
    what:
      "`entityStatus` and `mayGenerateClaims` in productEntity.ts implement what their own "
      + "comment calls 'the hard half of \u00a714' -- missing_information is 'a STOP, not a "
      + "warning: an entity in that state may be MENTIONED but must not have claims generated "
      + 'about it.\u2019 Both functions have ZERO production callers. Grep finds them only in '
      + 'their own test file. generate-blueprint reads the owned entity and uses `name` for a '
      + 'beat-audit signal, but nothing anywhere consults the status before letting a script '
      + 'make claims about a product. The rule was written, tested, and never connected.',
    decision:
      'STILL NOT WIRED, and the reason has CHANGED because the measurement was taken. '
      + '⚠️ MY EARLIER REASON WAS AN ASSUMPTION STATED AS FACT: I wrote that "most entities in '
      + 'production carry evidence null" and that enforcing the stop "would silence product '
      + 'claims for MOST existing products". Measured 2026-08-24 against production, read-only: '
      + 'public.product_entities contains ONE ROW IN TOTAL -- one owner, created 2026-08-18, '
      + 'none archived, none ever deleted. There is no "most". The sentence described a '
      + 'population that does not exist.\n\n'
      + '⚖️ AND THE MEASUREMENT DOES NOT SETTLE THE QUESTION EITHER. That single row would '
      + 'indeed return missing_information (evidence is null), which is 100% of the table and '
      + 'evidence of nothing: n=1 cannot distinguish "the mint never collects evidence" from '
      + '"this one row happens to lack it". Reporting 100% here would be the same error in the '
      + 'opposite direction. So the refusal stands on a NEW footing: not that wiring the stop '
      + 'would break most products, but that NOTHING IS KNOWN about what it would do, and a rule '
      + 'whose blast radius is unmeasured must not be connected to a creator-facing path.',
    revisitWhen:
      '⚠️ THE OLD TRIGGER -- "someone has counted" -- IS SPENT: it was counted, and the count '
      + 'was 1. A trigger a single query can satisfy while teaching nothing is not a trigger. '
      + 'The real precondition is a POPULATION: at least CLAIM_STOP_MIN_POPULATION live rows '
      + 'across more than one owner, at which point re-run the same query. If most of that '
      + 'population would return missing_information, the defect is that the mint never collects '
      + 'evidence and THAT is the fix. If few would, wire the stop. Until then the honest state '
      + 'is that the Product Library has barely been used, and THAT is the finding -- a claim '
      + 'stop is not the most valuable thing to build for a table with one row in it.',
    cost:
      'Low to wire, high to get wrong in either direction, and CHEAP TO LEAVE RIGHT NOW. '
      + 'Leaving it costs the guarantee \u00a714 was written to give -- a script may currently '
      + 'make claims about an entity with no name and no evidence.\n\n'
      + '\u26a0\ufe0f THE BOUND ON THAT EXPOSURE WAS STALE AND IS CORRECTED HERE. It read '
      + '"bounded by the same measurement: one entity, one owner". Re-measured 2026-09-05, '
      + 'read-only, live rows only: EIGHT rows across EIGHT DISTINCT OWNERS, all eight with '
      + 'evidence null and THREE with no name at all. The exposure grew 8x while the decision '
      + 'did not change, and a cost note that describes last month\u2019s population is the '
      + 'way a deferral quietly stops being the one that was agreed.\n\n'
      + '\u2696\ufe0f THE TRIGGER STILL HAS NOT FIRED, AND THIS STAYS OPEN. '
      + 'CLAIM_STOP_MIN_POPULATION is 25; eight is short of it. Only the "more than one '
      + 'owner" half of the condition is now satisfied, and half a trigger is not a trigger. '
      + 'The cost of wiring it blind is unchanged and unbounded, because nobody knows what it '
      + 'would block.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'STAGING_PHASE5_CANCEL_TEARDOWN_FLAKE',
    what:
      'On 2026-08-24 the staging matrix failed phase 5 on head 9798b1df with '
      + 'AssertionError [ERR_ASSERTION]: assert(!this.paused) thrown from Parser.finish '
      + '(node:internal/deps/undici/undici) during the DELIBERATE SIGTERM in the '
      + 'cancel-during_extract case. The diff under test touched only generate-blueprint show-'
      + 'moment wiring and a generated edge copy -- nothing in the cancellation path, the '
      + 'worker, or the HTTP client. A single workflow_dispatch re-run of the SAME head then '
      + 'passed, and the change merged.',
    decision:
      'RECORDED AS OBSERVED-AND-RECOVERED, AND DELIBERATELY NOT AS A DIAGNOSIS. Two runs of one '
      + 'head separate "reproducible on this commit" from "not reproducible on this commit"; '
      + 'they do not establish WHY an undici parser was mid-body when the socket was torn down. '
      + 'Writing "flaky teardown race" in here as a CAUSE would make the next person reading it '
      + 'stop looking, and a cancellation bug that surfaces once every N runs is exactly the '
      + 'kind that gets dismissed by an inherited label. What is known is the signature, the '
      + 'step, and that it did not recur on the same commit. The outcome was PRE-REGISTERED '
      + 'before the re-run -- pass meant merge without claiming a cause, the same failure meant '
      + 'stop and investigate -- so the merge is not a decision made after seeing a convenient '
      + 'result.',
    revisitWhen:
      'The same assert(!this.paused) signature appears in phase 5 on a DIFFERENT head. One '
      + 'occurrence is an anecdote; a second on unrelated code makes it a property of the '
      + 'cancellation teardown rather than of a commit, and at that point the thing to look at '
      + 'is the undici response body on the aborted extract call -- specifically whether it is '
      + 'consumed or destroyed before the socket goes away.',
    cost:
      'Investigating now costs a matrix trip per attempt against a failure that has not '
      + 'recurred and cannot be forced. Leaving it costs a re-run when it happens again -- and '
      + 'the standing rule already caps that at ONE re-run of the same head before it must be '
      + 'routed to the staging-harness issue rather than re-run until it goes green.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'SCENE_GUIDANCE_DOES_NOT_READ_THE_TYPE',
    what:
      'WAS: productSceneGuidance took an EntityType and, for everything shown through a '
      + 'screen, ignored it. Measured on 2026-08-24: SAAS, COURSE, DIGITAL_PRODUCT, '
      + 'MARKETPLACE and OTHER all returned the SAME four screen_recording moments, word '
      + 'for word, so a creator selling an online course and a creator selling a dashboard '
      + 'were told to do identical things with their camera. ⚠️ THAT MEASUREMENT NO LONGER '
      + 'HOLDS. COURSE, MARKETPLACE, APP, DIGITAL_PRODUCT and COMMUNITY now each have their '
      + 'own moments. SAAS and OTHER still take the default screen direction, which is '
      + 'correct rather than left over: that direction was WRITTEN for a dashboard.',
    decision:
      'RECORDED, NOT PATCHED, because the fix is content rather than wiring and inventing '
      + 'it here would be guessing at direction nobody has watched a creator follow. The '
      + 'owner asked for exactly this -- "guide them through scenes and words in detail, '
      + 'now show landing page, this part, point or wave a hand at it, now we show '
      + 'dashboard" -- and that request is about a SaaS dashboard specifically. A course '
      + 'is a curriculum page and a lesson list; a marketplace is a listing and a checkout. '
      + 'Those are different shots and different sentences. ⚠️ THIS WAS FOUND BY A GUARD '
      + 'FAILING AGAINST MY OWN CLAIM: a commit asserting "the type decides the show '
      + 'moments" was written, and the test proved it false before it shipped.',
    revisitWhen:
      'Any real recording exists of a creator following the screen_recording moments for '
      + 'something that is NOT a SaaS dashboard. The direction was written for a dashboard, '
      + 'and whether it survives contact with a course page is a question about a filmed '
      + 'video, not about this file. The two teleprompter recordings and the watched '
      + 'creator session are the first place that could be seen.',
    cost:
      'Writing per-type direction is cheap in code and expensive to get RIGHT -- it is the '
      + 'difference between a beat a creator can film and one they abandon mid-shoot. It '
      + 'also has to stay parity-checked against the edge copy, so it is a DB_EDGE_AUTH '
      + 'trip rather than a shared-package edit.',
    status: 'RESOLVED',
  }),
  Object.freeze({
    id: 'PER_TYPE_SCENE_DIRECTION_IS_UNFILMED',
    what:
      'Every screen-shown type now gets its own moments, and NOT ONE of them has been '
      + 'followed by a person holding a phone. The direction is written, parity-checked '
      + 'against the edge copy and unit-tested for shape. None of that is evidence that a '
      + 'creator can film it.',
    decision:
      '⚠️ RECORDED AS ITS OWN LIMITATION RATHER THAN FOLDED INTO THE ONE IT SUCCEEDS. '
      + 'SCENE_GUIDANCE_DOES_NOT_READ_THE_TYPE was a defect -- five types, one script -- '
      + 'and it is fixed. This is a different claim: that the words now written are words '
      + 'somebody can act on. Marking the first RESOLVED and stopping there would let a '
      + 'wiring change stand as evidence about a filmed video, which it is not.',
    revisitWhen:
      'A real recording exists of a creator following the moments for something that is '
      + 'NOT a SaaS dashboard. The two teleprompter recordings and the watched creator '
      + 'session are the first place that could be seen.',
    cost:
      'Leaving it costs nothing until somebody quotes the per-type direction as proven. '
      + 'The failure it guards against is exactly that quote.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'AUDIENCE_QUESTIONS_HAS_NO_SUPPLY',
    what:
      'generate-blueprint read the top 8 `audience_questions` rows and '
      + 'interpolated them into the knowledge block as "WHAT THEIR AUDIENCE KEEPS '
      + 'ASKING". The table has ZERO rows, has never had one, and has no writer '
      + 'anywhere: 0121 grants SELECT and DELETE to `authenticated` and INSERT to '
      + 'nobody. A live read against a table nothing can fill is the '
      + '"written and never read" defect inverted -- read and never written -- and '
      + 'it made the prompt look like it carried audience demand when it never could.',
    decision:
      'THE READER IS DELETED, AND A WRITER WAS DELIBERATELY NOT BUILT INSTEAD.\n\n'
      + '\u26a0\ufe0f THE EARLIER RULING WAS "the worker writes it, service-role, no '
      + 'client policy", and the measurement retired it. Of 1,080 stored '
      + '`creator_knowledge` rows, ONE carries an audience-asks frame; 18 mention '
      + '"ask" at all and 6 mention "question". Captions and transcripts are never '
      + 'persisted -- `brand_voices.profile` has no captions key across all 44 rows -- '
      + 'so `creator_knowledge` is the whole available corpus. A worker writing from '
      + 'it would produce roughly one row across every creator on the platform: a '
      + 'feature whose ON and OFF states are indistinguishable, which is the exact '
      + 'failure the ruling was trying to avoid.\n\n'
      + '\u2696\ufe0f AND THE CLIENT-TYPED VERSION WAS REFUSED FOR A DIFFERENT REASON. '
      + 'Asking a creator to type three questions their audience asks is a FOURTH '
      + 'place we ask for something we could observe, against a product direction '
      + 'that is otherwise infer-confirm-never-ask.',
    revisitWhen:
      'COMMENT INGESTION LANDS. What this block wanted is what a creator\u2019s '
      + 'AUDIENCE asks; the scan only ever captured what the CREATOR says, and those '
      + 'are different corpora. Comments are the real source: public, already inside '
      + 'the Apify pipeline, and `commentsDatasetUrl` is already present in the '
      + 'scrape output. The supply is one fetch away, not one feature away. When it '
      + 'lands, restore the read AND the block together -- a writer without the '
      + 'reader repeats this entry from the other side.',
    cost:
      'Deleting costs nothing measurable: the block could only ever render empty, so '
      + 'no prompt changes for any creator. Leaving it would have cost the next '
      + 'person the same investigation -- find the empty table, assume the writer is '
      + 'missing, build one against a corpus that supports a single row. That is the '
      + 'cost this entry exists to prevent, and it is why the reason is recorded '
      + 'rather than the code simply removed.',
    status: 'OPEN',
  }),
  Object.freeze({
    id: 'COMMUNITY_MOMENTS_ARE_UNREACHABLE',
    what:
      'productScenes gives COMMUNITY its own show moments -- the inside view, with a '
      + 'permission-and-privacy instruction, added in #520. MEASURED 2026-08-24: '
      + 'inferShowability returns NEVER for COMMUNITY on every input -- canRecordScreen true, '
      + 'false and unset all give NEVER -- and productSceneGuidance returns mayShow false with '
      + 'ZERO moments at NEVER. So those moments cannot be reached through the showability '
      + 'path. They are written, parity-checked against the edge copy, unit-tested, and dead.',
    decision:
      '⚖️ SETTLED BY THE OWNER, AND IT WAS NEITHER OPTION I OFFERED. I asked for a choice '
      + 'between deleting the moments and making communities showable. The answer was a third '
      + 'thing: communities ARE showable, and the shot is a CAMERA POINTED AT A PHONE, never a '
      + 'screen recording -- which also made the moments wrong in a way I had not spotted, since '
      + 'they were typed screen_recording. ⚠️ I WROTE THOSE MOMENTS and had said so when I '
      + 'declined to pick; the option that saved my own work was not the one taken, and the '
      + 'version that shipped is better than either I proposed.',
    revisitWhen:
      'The owner says which a community is: a place with a screen worth recording, or a thing '
      + 'with nothing to film. It is one product judgement and it needs no data.',
    cost:
      'Zero today -- unreachable code shows a creator nothing. The cost is that it LOOKS done: '
      + 'a reader finds COMMUNITY moments in the file and concludes communities are handled.',
    status: 'RESOLVED',
  }),
])

export const openLimitations = (): readonly KnownLimitation[] =>
  KNOWN_LIMITATIONS.filter((l) => l.status === 'OPEN')

export const limitationById = (id: string): KnownLimitation | null =>
  KNOWN_LIMITATIONS.find((l) => l.id === id) ?? null
