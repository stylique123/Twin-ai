// @twinai/shared — code used by the web app (Vercel): data types, brand/pricing
// constants, the Recording Script, and the backend API layer (client-agnostic;
// call initApi() once at app startup). Kept as its own package so the API and
// domain logic stay decoupled from the React/Vite app that consumes them.
export * from './types'
export * from './brand'
export * from './recordingScript'
export * from './regenerateReason'
export * from './acceptedFinal'
export * from './questionDeficit'
export * from './entryDoor'
export * from './sceneConsistency'
export * from './recordingScriptAdapter'
export * from './recordingScriptApi'
export * from './scriptEdit'
export * from './scriptEditRecord'
export * from './creatorQuestions'
export * from './storySuggestions'
export * from './scriptAttempt'
export * from './editClassification'
export * from './hookChoice'
export * from './styleCompiler'
export * from './premiseCompatibility'
export * from './contentHistory'
export * from './generationReadiness'
// The three per-video intent questions and their compilation. Exported here
// because the create screen, the building screen and the readiness gate all need
// the same enums, and a second copy is what this module exists to end.
export * from './videoIntent'
// One derivation of "which platform is this link", shared by the client's
// supported-host check and the ingest function's stored value.
export * from './referencePlatform'
export * from './galleryRank'
export * from './referenceEvidence'
export * from './referenceAnalysis'
export * from './creatorFacingError'
export * from './creativeTransferRows'
export * from './containerResolution'
export * from './containerSupply'
export * from './bestTime'
export * from './api'
export * from './outcomeLog'
// The join nobody had made: which format a creator's own posts actually got
// watched for. Pure read over posts + generations; see formatOutcomes.ts.
export * from './formatOutcomes'
export * from './capture'
export * from './preflight'
export * from './preScriptBrief'
export * from './inAppPath'
export * from './beatPlan'
export * from './productEvidence'
export * from './productEntity'
export * from './productExtraction'
export * from './productFreshness'
export * from './referenceMechanism'
export * from './creatorKnowledge'
export * from './knowledgeSelection'
export * from './knowledgeResolver'
export * from './spokenPlaceholders'
export * from './shotDirection'
// Which setup each scene is filmed in — the recorder's sticky strip and the
// scene cards both read this rather than re-comparing background strings.
export * from './setupPlan'
// Figures spoken about a product must trace to a stored product fact.
export * from './productClaimCheck'
export * from './comparativeClaim'
export * from './ownPerformance'
// Only a named thing with real commercial evidence may be suggested as a product.
export * from './productSuggestionConfidence'
// The six onboarding questions asked while the scan runs, and what they change.
export * from './creatorProfileQuestions'
export * from './authority'
export * from './profileAssembler'
export * from './creativeDecisionPlan'
export * from './cta'
export * from './profileCompletion'
export * from './setupAreas'
export * from './referenceAssessment'
export * from './referenceProfile'
export * from './galleryPolicy'
// The parity eval's decision layer. Exported here rather than kept beside the
// script so it CALLS the real `eligibility` above instead of re-listing which
// fields matter — a second copy of that judgement would drift in silence.
export * from './extractionParityDecisions'
export * from './compatibilityGate'
export * from './editor/index'
export * from './referenceExtraction'
export * from './visualExtraction'
export * from './pilotSample'
export * from './recordingFunnel'
export * from './referenceLibraryHealth'
export * from './uploadForensics'
export * from './slotFill'
export * from './galleryCreatorView'
export * from './storedReferenceProfile'
export * from './formatProfile'
export * from './containerTemplates'
export * from './writerInput'
export * from './speechPolish'
export * from './scriptValidator'
export * from './sessionEvents'
export * from './questionRegistry'
export * from './pilot/claimSentence'
export * from './pilot/claimNote'
export * from './pilot/nextUnanswered'
export * from './pilot/cutOrder'
export * from './pilot/knownLimitations'
export * from './pilot/fieldMeaningUpgrades'
export * from './pilot/callFailure'
export * from './gate/talkingHeadFit'
// ⚖️ THE ACCOUNT HALF'S MISSING READER. The worker writes four columns onto the
// voice on every sample and apps/web imported `messageForOwnAccount` NOWHERE —
// one half of one gate spoke to the creator and the other never had.
export * from './gate/ownSampleRow'

// ⚖️ A COST CEILING PER ACCOUNT. The hourly rate limit answers "are you
// hammering us"; nothing answered "have you spent a month of our budget".
export * from './scanCeiling'

// ⚠️ THESE FOUR WERE WRITTEN AND NOT EXPORTED, WHICH IS WORSE THAN NOT CALLED.
// A module missing from this barrel is not merely unused — it is UNREACHABLE
// from apps/web, so "nothing imports it" reads as a choice when it was an
// omission. scanFailure sat here for a whole release doing nothing while the
// onboarding screen still told creators their public account might be private.
export * from './scanFailure'
export * from './questionAudit'
export * from './productScenes'
export * from './shotGrammar'
export * from './screenCaptureConversion'
export * from './communityMap'
export * from './communityChecks'
export * from './communityCapture'
export * from './pilot/backlogRuns'
export * from './productQuestions'
export * from './productLifecycle'
export * from './briefToProfileAnswers'
// ⚠️ THE SCRIPT CONTRACTS. `beatAsk` is exported because the CLIENT renders the
// question and fills the scaffold; the other two are read by the edge function
// through their generated Deno copies and by their own tests, and are exported
// here so a future reader does not write a third copy of a rule that exists.
export * from './script/beatAsk'
export * from './script/craftBeats'

// ⚖️ THE METER READS THESE. Counts a creator can check, never a score.
export * from './twinStrength'

// ⚖️ SIGNATURE VOCABULARY, MEASURED. Voice Cause 3.
export * from './signaturePhrases'

// ⚖️ THE FLOOR BELOW THE FLOOR. Voice Cause 1(a) — a labeled genre default for
// when nothing measured or verbatim exists yet.
export * from './defaultRegisterCard'
// ⚖️ THE SHOT-CARD HEADING. 44% of production rows name their shot with a
// bare ordinal; the card must not render one.
export * from './script/shotLabel'

// ⚖️ HOW LONG THIS SCRIPT ACTUALLY RUNS. 17 of 35 production scripts run >25%
// longer than the reference they adapted, 10 run >25% shorter, one is 4 seconds
// — and no screen said so. Disclosure, never enforcement.
export * from './script/scriptLength'
export * from './script/runtimeCompare'

// ⚖️ FIX 7. "Write to target_sec" was prose; nothing computed it. Per-beat
// detection only -- the spec's own repair step assumes a target_sec reader
// downstream that does not exist yet, and repairing an unread field is the
// exact defect this session's audit already found twice.
export * from './script/timingMath'

// ⚖️ THE FIRST SECOND. The writer has been producing a visual hook all along —
// 4 of 4 complete — and NOTHING read it. Delivery was the defect, not
// completeness.
export * from './script/visualHook'

// ⚖️ A SILENT BEAT IS NOT A BLANK TO FILL IN. "[No spoken audio]" and
// "[Hook Option 1]" were one check, so the hook got pasted over deliberate
// silence — three times out of four beats in one production script.
export * from './script/silentBeat'

// ⚖️ FOUR SCENES, ONE LOCATION STRING, AND NOTHING CHECKED IT. The retention
// doctrine requires scene-to-scene visual change; flags a run of ≥3
// consecutive speaking beats with an identical (location, framing) pair.
// Detection only — repair is a UI-offered suggestion, never a model rewrite.
export * from './script/sceneVariety'

// ⚖️ FIX 8a. A body line that restates a non-selected hook option almost
// word-for-word — lexical repetition of a known string, decidable by
// containment. hook_options[0] is never checked (it IS the hook beat).
export * from './script/hookBodyCollision'

// ⚖️ FIX 11. Sermon without witness, detected. How many beats draw on the
// creator's own supplied knowledge AND are spoken in their own voice, and
// how many beats carry a real figure at all — two separate counts, so a
// script grounded in a reference's numbers but zero first-person evidence
// cannot hide behind one blended score.
export * from './script/witnessScore'
export * from './script/toneEffect'

// ⚖️ FIX 12. Whether the chosen subject/content-focus option ("Something I've
// experienced") points at a source the creator's knowledge genuinely holds,
// or was about to be silently substituted with the same pool "Something I
// know well" would have used.
export * from './script/subjectSource'

// ⚖️ FIX 13. What the frames pass saw, read into the prompt at last — the
// cache (`reference_content_profiles.visual_profile`) has been populated
// since migration 0152 and had zero readers. `setting`/`camera_work` show up
// here on purpose: `compatibilityGate.ts` leaves both out because a
// transcript cannot see a room or a lens, and a frame can.
export * from './script/observedVisual'
// ⚖️ A STOCK PHRASE IS NOT A STANCE. The prompt already bans these and the
// writer shipped 7 anyway; but 4 of those 7 were the creator naming their
// ENEMY, so the list is phrase-level and "hustle" is deliberately absent.
export * from './script/clichePhrases'
export * from './script/repetition'
export * from './script/advisoryRead'

// ⚖️ FIX 1 (Wave 1). A spoken line sharing a ≥6-content-word contiguous run
// with the reference transcript is the reference's own sentence, not this
// creator's. Detection only — the writer path decides whether to repair the
// beat or turn it into an `ask`.
export * from './script/phraseOverlap'
export * from './script/verbatimOverlap'
export * from './script/referenceExposure'

// ⚖️ FIX 8b. The blind-tested repair trigger only — "2+ substantive soft
// beats" (3-0), never the payoff branch (1-6, G20 forbids building it). Pure
// so the trigger is testable without a model call; the judge call itself is
// edge-only, cost-gated, and lives beside `advisoryRead`'s call site.
export * from './script/semanticRepetition'

// ⚖️ FIX 4 (Wave 2). `shot_list[].spoken_text` and `script[i].line` are
// written together, once, by the same model call — then only `script` gets
// rewritten by every repair after it (Fix 1/2/3, entitlement, ask/answer
// fill). This resyncs the shot list against the FINAL script, after every
// repair has already run, so the shot card and the teleprompter never
// disagree about what a beat says.
export * from './script/shotListSync'

// ⚖️ FIX 7 (Wave 3). `shot_list[].notes` carries a "Setup <letter> ·
// description · framing" label the model writes once, in the same response
// as `shot_list` and `script`, and nothing downstream ever reconciles. This
// resyncs those labels against each other so the same (description, framing)
// pair always gets the same letter and two different ones never share one —
// see `liveRunFixtures.test.ts` §7.
export * from './script/setupLabelSync'

// ⚖️ FIVE HOOKS THAT ARE REALLY ONE. Two production menus open with the same
// three words five times over; three more do it three times. The opener is the
// creator's own signature, so this reports the COLLISION, never the words.
export * from './script/hookVariety'

// ⚖️ "X, Y, AND Z" REPEATED IS A TIC, NOT A SENTENCE. Voice Cause 2's
// structural AI-tell detector — a triadic list once is ordinary language,
// twice across one script is the templated cadence.
export * from './script/parallelTriads'
export * from './script/craftContracts'
export * from './notBilled'
export * from './script/sentenceUniformity'

// ⚖️ THE SHOOTING NOTE THAT WAS THROWN AWAY. `beat_plan[].proof` is 20-of-20
// complete in production and `proofAt` had ZERO callers. Shown only where it
// describes what the CREATOR performs — never a b-roll or screen-recording
// request, both of which appear in the real data and are out of scope.
export * from './script/beatProof'
