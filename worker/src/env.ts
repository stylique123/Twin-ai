// Worker configuration — all server-side. The worker holds the Supabase SERVICE
// ROLE key (never shipped to any client) and the provider keys.
// Trim values: a stray space/newline in an env file (e.g. a trailing space after
// a pasted URL) would otherwise corrupt URLs and tokens.
function need(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

// The alternate model-manifest path exists only so the staging matrix can prove
// a legitimate analyzer-version cache bump.  It must never be selectable by a
// production worker, even if an environment variable is injected accidentally.
// Non-production callers must opt in explicitly as well.
export function resolveSpeechModelManifest(source: NodeJS.ProcessEnv = process.env): string {
  if ((source.NODE_ENV ?? '').trim() === 'production') return ''
  if (source.EDITOR_ALLOW_TEST_MODEL_MANIFEST !== 'true') return ''
  return (source.EDITOR_SPEECH_MODEL_MANIFEST ?? '').trim()
}

export const env = {
  supabaseUrl: need('SUPABASE_URL'),
  serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  geminiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  // YouTube + Instagram ingestion: datacenter IPs get bot-blocked by yt-dlp
  // ("Sign in to confirm you're not a bot" on YouTube; "rate-limit reached or
  // login required" on Instagram). We route both through Apify transcript Actors
  // instead, which pull real captions/transcripts reliably.
  //
  // ⚠️ "TikTok still uses yt-dlp (that works from datacenter IPs)" was TRUE when
  // written and is FALSE now. A live scan of a real user's TikTok profile from
  // the production worker returned zero posts — TikTok bot-blocks the datacenter
  // IP exactly as YouTube and Instagram already did. The job still reported
  // `done`, the voice stayed `ready`, and `creator_knowledge` stayed empty, so
  // nothing anywhere said the scan had read nothing. The PROFILE scrape now
  // falls back to Apify the same way transcripts already do.
  // `fastModel` lived here and named a model literal. It is gone: the same
  // choice is now the `extract` task class in worker/model_routing_v1.json,
  // which still honours GEMINI_FAST_MODEL and resolves to the same id, so
  // nothing moves. The reasoning that was in this comment — mechanical,
  // schema-constrained work does not need the expensive model — is a TASK-CLASS
  // argument, and it now lives beside the class it argues about.
  apifyToken: (process.env.APIFY_TOKEN ?? '').trim(),
  // ⚠️ SEPARATE FROM `apifyToken`, AND NOT DERIVABLE FROM IT. Apify's residential
  // proxy authenticates with its own password, which is why an account with a
  // working token can still have no proxy. Absent means "no proxy configured",
  // which degrades the palette to caption-only rather than failing a scan.
  apifyProxyPassword: (process.env.APIFY_PROXY_PASSWORD ?? '').trim(),
  // Actor that returns YouTube captions as [{ start, dur, text }] in its KV output.
  apifyYoutubeActor: (process.env.APIFY_YOUTUBE_ACTOR ?? 'faVsWy9VTSNVIhWpR').trim(),
  // Actor that returns Instagram transcripts as dataset items with
  // { text, duration, segments: [{ start, end, text }] }. ID for
  // apple_yang/instagram-transcripts-scraper.
  apifyInstagramActor: (process.env.APIFY_INSTAGRAM_ACTOR ?? 'S9A11NvceWaGorwwh').trim(),
  // PROFILE scrapers — the creator's own back catalogue, not one clip's captions.
  // Both IDs were run at full breadth against real creator accounts before being
  // put here (9 accounts, 650 posts, 0 failures), so they are proven rather than
  // guessed.
  // clockworks/tiktok-profile-scraper. Input {profiles, resultsPerPage,
  // profileSorting}; `profileSorting` is a LOWERCASE enum and rejects 'Latest'.
  apifyTiktokProfileActor: (process.env.APIFY_TIKTOK_PROFILE_ACTOR ?? '0FXVyOXXEmdGcV88a').trim(),
  // streamers/youtube-channel-scraper. Input {startUrls, maxResults,
  // maxResultsShorts}; maxResultsShorts MUST match maxResults or a shorts-first
  // channel returns NOTHING, which is indistinguishable from a wrong handle.
  apifyYoutubeChannelActor: (process.env.APIFY_YOUTUBE_CHANNEL_ACTOR ?? '67Q6fmd8iedTVcCwY').trim(),
  // apify/instagram-scraper. Input {directUrls, resultsType, resultsLimit};
  // directUrls needs the trailing-slash profile form, and `posts` carries the
  // caption but NOT the follower count — that is a separate charged run, so
  // ScrapedProfileFacts reports audience as null rather than guessing.
  apifyInstagramProfileActor: (process.env.APIFY_INSTAGRAM_PROFILE_ACTOR ?? 'shu8hvrXbJbY3Eb9W').trim(),
  // Which job types this worker process handles.
  // 'transcribe' removed — it was registered + claimed but nothing ever enqueues it
  // (ingest-reference enqueues type 'ingest'). 'autoedit' removed with the old AI
  // editor. build_dna stays edge-driven (dna-poll), never add it here or the worker
  // would dead-letter it.
  // purge_media is in the DEFAULT set deliberately. It is enqueued by a
  // database trigger (0099), so nothing in application code would reveal its
  // absence: every deletion would queue a job no worker claims, it would sit
  // until it aged out, and the bytes behind a deleted recording would stay
  // exactly where they were — with the migration, the trigger and the handler
  // all looking correct. A job type nobody drains is a feature that does
  // nothing, quietly.
  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'ingest,build_voice,scrape_dna,validate_source,validate_clip,editor_v2,purge_media,extract_product,assess_reference').split(',').map((s) => s.trim()),
  // Poll cadence + claim concurrency.
  pollMs: Number(process.env.WORKER_POLL_MS ?? '3000'),
  // Lease must EXCEED the longest job, or a slow render gets reclaimed mid-flight
  // and double-run. ffmpeg can run up to maxMediaSecs*2 (~1800s), so lease 2400s.
  visibilitySecs: Number(process.env.WORKER_VISIBILITY_SECS ?? '2400'),
  // Loop-level HARD timeout: a backstop so a hung handler (an ffmpeg/yt-dlp that
  // never returns) can't pin THIS worker forever and stall its queue. Kept UNDER the
  // lease (2400s) so the worker gives up before the job is reclaimed by a peer —
  // avoiding a double-run overlap. With SKIP-LOCKED claims this is what makes running
  // N concurrent worker containers across hosts genuinely safe.
  maxJobMs: Number(process.env.WORKER_MAX_JOB_MS ?? '2100000'), // 35 min, < lease
  // Base of the retry backoff curve (30s, 60s, 120s… in production). The
  // staging matrix shrinks it so retry scenarios settle in seconds.
  retryBackoffBaseSecs: Number(process.env.WORKER_RETRY_BACKOFF_BASE_SECS ?? '30'),

  // ASR. 'base' is the speed/quality sweet spot for short-form English (≈1.5-2x
  // faster than 'small').
  whisperModel: process.env.WHISPER_MODEL ?? 'base', // tiny|base|small|medium
  whisperDevice: process.env.WHISPER_DEVICE ?? 'cpu', // cpu|cuda
  // Pin the spoken language so faster-whisper never mis-detects an English take
  // as Arabic/Urdu/etc. 'auto' restores detection.
  whisperLanguage: (process.env.WHISPER_LANGUAGE ?? 'en').trim(),
  maxMediaSecs: Number(process.env.WORKER_MAX_MEDIA_SECS ?? '900'), // skip > 15 min by default
  // Hard cap on any single Storage download (raw take, reference media). The
  // single worker buffers/streams these to disk; an oversized or corrupt object
  // would otherwise OOM the process and wedge the whole queue. 600 MB comfortably
  // covers a 15-min phone take while bounding worst-case memory/disk per job.
  maxDownloadBytes: Number(process.env.WORKER_MAX_DOWNLOAD_BYTES ?? String(600 * 1024 * 1024)),

  // Source validation (validate_source) bounds — configurable so the product
  // limit can tighten without a code change. 30 min is a hard sanity cap for a
  // short-form editor; the pixel cap admits 4K (3840x2160 ≈ 8.3M px) and
  // rejects decode-bomb resolutions above it.
  sourceMaxDurationMs: Number(process.env.SOURCE_MAX_DURATION_MS ?? String(30 * 60 * 1000)),
  sourceMinDurationMs: Number(process.env.SOURCE_MIN_DURATION_MS ?? '500'),
  sourceMaxPixels: Number(process.env.SOURCE_MAX_PIXELS ?? String(3840 * 2160)),

  // ---- editor_v2 orchestration (Phase 3) ----
  // Per-stage hard timeout: a hung stage fails RETRYABLE well before the
  // visibility lease would expire (no silent reclaim mid-stage).
  editorStageTimeoutMs: Number(process.env.EDITOR_STAGE_TIMEOUT_MS ?? '300000'),
  // Background lease-renewal cadence while an editor_v2 job runs. Must be
  // comfortably under WORKER_VISIBILITY_SECS.
  editorLeaseRenewMs: Number(process.env.EDITOR_LEASE_RENEW_MS ?? '30000'),
  // Orphaned per-job scratch dirs older than this are swept on each claim.
  editorTempMaxAgeMs: Number(process.env.EDITOR_TEMP_MAX_AGE_MS ?? String(6 * 3600 * 1000)),
  // SIMULATED stage work (Phase 3 has no real stage implementations): how long
  // each stage pretends to work, plus deterministic fault injection for the
  // staging matrix (fail a named stage while job.attempts <= N, in one of
  // three modes: retryable | permanent | hang).
  editorSimStageMs: Number(process.env.EDITOR_SIM_STAGE_MS ?? '300'),
  editorSimFailStage: (process.env.EDITOR_SIM_FAIL_STAGE ?? '').trim(),
  editorSimFailMode: (process.env.EDITOR_SIM_FAIL_MODE ?? 'retryable').trim() as 'retryable' | 'permanent' | 'hang',
  editorSimFailAttempts: Number(process.env.EDITOR_SIM_FAIL_ATTEMPTS ?? '9999'),
  // Deterministic crash injection ('before_stage:<stage>' | 'after_finish');
  // empty in production — matrix-only, proves exact crash-point recovery.
  editorSimCrashPoint: (process.env.EDITOR_SIM_CRASH_POINT ?? '').trim(),

  // ---- directing (Phase 7) ----
  // Gate for the REAL directing stage. Unset/anything-but-'true' => directing
  // stays SIMULATED (production behaviour is unchanged). Enabled only in the
  // staging matrix. Requires GEMINI_API_KEY when enabled (fails closed).
  editorDirectorEnabled: (process.env.EDITOR_DIRECTOR_ENABLED ?? '').trim() === 'true',
  // Hard timeout for THE single director generateContent call (no retry).
  editorDirectorTimeoutMs: Number(process.env.EDITOR_DIRECTOR_TIMEOUT_MS ?? '60000'),

  // ---- render (Phase 8) ----
  // Gate for the REAL compiling/rendering/validating stages. Unset (or anything
  // but exactly 'true') => all three stay SIMULATED and production behaviour is
  // unchanged. Same shape as the director gate on purpose: `!== 'true'` rather
  // than `=== 'false'`, so a typo, an empty string or an unset variable all
  // fail CLOSED rather than enabling a renderer nobody asked for.
  editorRenderEnabled: (process.env.EDITOR_RENDER_ENABLED ?? '').trim() === 'true',

  // ---- the review gate (Phase 10 item 4) ----
  // When enabled, a directed project PARKS in `awaiting_review` and waits for
  // the creator to submit their overlay before compiling. Unset => the pipeline
  // runs straight through exactly as it does today, and an overlay submitted
  // out of band is still consumed if one happens to exist.
  //
  // FAILS CLOSED IN THE DIRECTION THAT MATTERS. A typo here does not silently
  // park every project in a state whose only exit is a screen the creator may
  // not know to visit — it renders the video, which is what they asked for.
  editorReviewGateEnabled: (process.env.EDITOR_REVIEW_GATE_ENABLED ?? '').trim() === 'true',
  // Bucket the rendered output and cover are uploaded to. The PATH is never
  // configured — it comes from `editor_reserve_output`, which derives it
  // server-side.
  // 'edits' — the bucket 0065 creates for finished renders. The old default was
  // 'media', which no migration creates, no policy references and no deployment
  // sets: every render would have encoded, validated, and then 404'd on upload.
  // 0097 fences the reservation RPC to the same value, so a wrong setting here
  // is refused before an encode is spent rather than after one.
  editorOutputBucket: (process.env.EDITOR_OUTPUT_BUCKET ?? 'edits').trim(),
  // Where the catalog's caption fonts live in the image. Only read when a plan
  // actually has cues.
  editorFontsDir: (process.env.EDITOR_FONTS_DIR ?? '/usr/share/fonts/truetype/dejavu').trim(),
  // The worker's own frozen brand assets, COPYed to /app/assets by the
  // Dockerfile (WORKDIR /app). ABSOLUTE ON PURPOSE: ffmpegGraph's PATH_RE
  // accepts only absolute plain paths, so a relative default would pass the
  // existence and digest checks and then be refused by the graph builder as
  // `render_graph_invalid` — a late, opaque failure for a trivial reason.
  editorAssetsDir: (process.env.EDITOR_ASSETS_DIR ?? '/app/assets').trim(),
  // Refuse a caption font with no pinned digest. Defaults ON: an absent digest
  // silently satisfying an integrity check is how a font substitution reaches
  // production wearing a green tick, so a deployment that has not pinned its
  // fonts yet must say so explicitly rather than inherit a pass.
  editorStrictFontIntegrity: (process.env.EDITOR_STRICT_FONT_INTEGRITY ?? 'true').trim() !== 'false',

  // ---- media inspection (Phase 4) ----
  // Cache identity: one immutable inspection component per
  // (source_asset_id, component, inspector version). Bumping the version
  // recomputes; same version reuses.
  inspectorVersion: (process.env.EDITOR_INSPECTOR_VERSION ?? 'inspect-1').trim(),
  // ffprobe hard timeout for the (exceptional) fallback/upgrade probe.
  inspectProbeTimeoutMs: Number(process.env.EDITOR_INSPECT_PROBE_TIMEOUT_MS ?? '60000'),
  // Matrix-only: hold at a named inspection boundary so cancellation can be
  // proven to land in every window ('before_download' | 'during_download' |
  // 'before_probe' | 'during_probe' | 'after_probe' | 'after_persist').
  inspectSlowPoint: (process.env.EDITOR_INSPECT_SLOW_POINT ?? '').trim(),
  inspectSlowMs: Number(process.env.EDITOR_INSPECT_SLOW_MS ?? '4000'),

  // ---- speech analysis (Phase 5) ----
  // Cache identity: one immutable speech component per
  // (source_asset_id, 'speech', speech version). Bumping recomputes.
  // speech-2: disfluency emission (bridge suppress_tokens=[]) vs speech-1.
  // speech-3: ASR model base -> small (reviewer-approved). speech-4: VAD-aware
  // candidate rules (speech-rules-2: silence regions from word gaps UNION VAD
  // gaps; VAD pause evidence for false starts) + disfluency-context prompt.
  // speech-5: acoustic-evidence filler guard + neighbor-overlap guard + VAD-core
  // silence-region shrinking (speech-rules-3) — changes candidate output, so the
  // analyzer-bundle cache identity advances. Each bridge/model/rules change bumps.
  // speech-6: PIN the model snapshot. The bare `small` alias resolved the moving
  // Hugging Face default, so a rebuilt image could produce different immutable
  // analysis under the same version. speech-6 loads the exact digest-verified
  // Systran/faster-whisper-small revision (worker/models/*.manifest.json) offline
  // and records repo+revision+digest in provenance — the model is now part of the
  // pinned bundle identity, so pinning it advances the version.
  speechVersion: (process.env.EDITOR_SPEECH_VERSION ?? 'speech-6').trim(),
  // ASR model LABEL for the speech component (independent of the caption/reference
  // knob so a caption tweak can never silently change component identity). The
  // actual weights come from speechModelPath (pinned snapshot), not this alias.
  speechModel: (process.env.EDITOR_SPEECH_MODEL ?? process.env.WHISPER_MODEL ?? 'small').trim(),
  // PINNED local snapshot dir + manifest. The Docker build (and CI) fetch the
  // exact revision here and digest-verify it; the bridge loads ONLY this path
  // with the network disabled. Overridable for CI, where the snapshot is fetched
  // to a runner temp dir.
  speechModelPath: (process.env.EDITOR_SPEECH_MODEL_PATH ?? '/opt/models/faster-whisper-small').trim(),
  // Manifest the bridge verifies the loaded bytes against. Defaults (empty) to
  // the checked-in production manifest resolved in editorSpeech.ts. A matching
  // test pin requires an explicit non-production opt-in; production ignores the
  // override even if both variables are injected.
  speechModelManifest: resolveSpeechModelManifest(),
  // Hard timeouts: audio extraction is I/O-bound (minutes at worst); ASR on
  // CPU runs ~0.2-0.5x realtime for `base`, so 15 min of audio fits well
  // inside 20 min. Both stay far under the 2400s visibility lease.
  speechExtractTimeoutMs: Number(process.env.EDITOR_SPEECH_EXTRACT_TIMEOUT_MS ?? '180000'),
  speechAsrTimeoutMs: Number(process.env.EDITOR_SPEECH_ASR_TIMEOUT_MS ?? '1200000'),
  // Minimum word/VAD gap that becomes a silence CANDIDATE (evidence only).
  speechSilenceMinMs: Number(process.env.EDITOR_SPEECH_SILENCE_MIN_MS ?? '700'),
  // Silero VAD parameters (pinned in the bridge; surfaced for provenance so a
  // change is visible in the component and can be tied to a version bump).
  speechVadMinSilenceMs: Number(process.env.EDITOR_SPEECH_VAD_MIN_SILENCE_MS ?? '300'),
  speechVadSpeechPadMs: Number(process.env.EDITOR_SPEECH_VAD_SPEECH_PAD_MS ?? '100'),
  // Matrix-only boundary holds ('before_reconcile' | 'before_download' |
  // 'during_download' | 'before_extract' | 'during_extract' | 'before_asr' |
  // 'after_asr_before_persist' | 'after_persist').
  speechSlowPoint: (process.env.EDITOR_SPEECH_SLOW_POINT ?? '').trim(),
  speechSlowMs: Number(process.env.EDITOR_SPEECH_SLOW_MS ?? '4000'),
  // Matrix-only deterministic bridge holds so cancellation lands in the
  // model-load / mid-transcription windows ('after_model_load' |
  // 'after_transcribe'). The worker kills the bridge process group on abort.
  speechBridgeHoldAt: (process.env.EDITOR_SPEECH_BRIDGE_HOLD_AT ?? '').trim(),
  speechBridgeHoldMs: Number(process.env.EDITOR_SPEECH_BRIDGE_HOLD_MS ?? '0'),

  // ---- analysis stage (Phase 6) ----
  // Component versions/config are FROZEN CONSTANTS (worker/analysis_rules_v1.json
  // + editorManifest.ts), never env-driven — env here is timeouts + matrix only.
  // Pinned local YuNet snapshot + manifest (digest-verified by editor_visual.py
  // before load; identity is part of the visual componentDigest).
  visionModelPath: (process.env.EDITOR_VISION_MODEL_PATH ?? '').trim(),
  visionModelManifest: (process.env.EDITOR_VISION_MODEL_MANIFEST ?? '').trim(),
  // Hard timeouts: the visual bridge decodes bounded sample counts (<=900
  // coarse + <=360 fine + <=120 face frames); PCM decode + ebur128 are
  // I/O-bound single passes. All stay far under the 2400s visibility lease.
  visualTimeoutMs: Number(process.env.EDITOR_VISUAL_TIMEOUT_MS ?? '600000'),
  audioDecodeTimeoutMs: Number(process.env.EDITOR_AUDIO_DECODE_TIMEOUT_MS ?? '180000'),
  loudnessTimeoutMs: Number(process.env.EDITOR_LOUDNESS_TIMEOUT_MS ?? '180000'),
  // Matrix-only boundary holds for the analyzing stage ('before_reconcile' |
  // 'before_download' | 'during_download' | 'before_visual' | 'during_visual' |
  // 'before_audio' | 'during_audio' | 'before_hook' | 'before_persist' |
  // 'after_persist').
  analyzeSlowPoint: (process.env.EDITOR_ANALYZE_SLOW_POINT ?? '').trim(),
  analyzeSlowMs: Number(process.env.EDITOR_ANALYZE_SLOW_MS ?? '4000'),

  workerId: process.env.FLY_MACHINE_ID ?? process.env.HOSTNAME ?? `worker-${process.pid}`,
}
