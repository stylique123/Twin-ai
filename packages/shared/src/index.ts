// @twinai/shared — code used by the web app (Vercel): data types, brand/pricing
// constants, the Recording Script, and the backend API layer (client-agnostic;
// call initApi() once at app startup). Kept as its own package so the API and
// domain logic stay decoupled from the React/Vite app that consumes them.
export * from './types'
export * from './brand'
export * from './recordingScript'
export * from './sceneConsistency'
export * from './recordingScriptAdapter'
export * from './recordingScriptApi'
export * from './scriptEdit'
export * from './scriptEditRecord'
export * from './creatorQuestions'
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
export * from './creativeTransferRows'
export * from './containerResolution'
export * from './containerSupply'
export * from './bestTime'
export * from './api'
export * from './outcomeLog'
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

// ⚠️ THESE FOUR WERE WRITTEN AND NOT EXPORTED, WHICH IS WORSE THAN NOT CALLED.
// A module missing from this barrel is not merely unused — it is UNREACHABLE
// from apps/web, so "nothing imports it" reads as a choice when it was an
// omission. scanFailure sat here for a whole release doing nothing while the
// onboarding screen still told creators their public account might be private.
export * from './scanFailure'
export * from './questionAudit'
export * from './productScenes'
export * from './shotGrammar'
export * from './pilot/backlogRuns'
export * from './productQuestions'
export * from './productLifecycle'
export * from './briefToProfileAnswers'
