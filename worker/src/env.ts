// Worker configuration — all server-side. The worker holds the Supabase SERVICE
// ROLE key (never shipped to any client) and the provider keys.
// Trim values: a stray space/newline in an env file (e.g. a trailing space after
// a pasted URL) would otherwise corrupt URLs and tokens.
function need(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

export const env = {
  supabaseUrl: need('SUPABASE_URL'),
  serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  geminiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  // YouTube + Instagram ingestion: datacenter IPs get bot-blocked by yt-dlp
  // ("Sign in to confirm you're not a bot" on YouTube; "rate-limit reached or
  // login required" on Instagram). We route both through Apify transcript Actors
  // instead, which pull real captions/transcripts reliably. TikTok still uses
  // yt-dlp + whisper (that works from datacenter IPs).
  // Optional cheaper/faster model for the MECHANICAL Gemini calls (reference-
  // structure extraction). Pointing this at your flash model cuts COGS with no
  // quality loss on these schema-constrained tasks. Defaults to the main model
  // (no behaviour change) until set.
  fastModel: (process.env.GEMINI_FAST_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview').trim(),
  apifyToken: (process.env.APIFY_TOKEN ?? '').trim(),
  // Actor that returns YouTube captions as [{ start, dur, text }] in its KV output.
  apifyYoutubeActor: (process.env.APIFY_YOUTUBE_ACTOR ?? 'faVsWy9VTSNVIhWpR').trim(),
  // Actor that returns Instagram transcripts as dataset items with
  // { text, duration, segments: [{ start, end, text }] }. ID for
  // apple_yang/instagram-transcripts-scraper.
  apifyInstagramActor: (process.env.APIFY_INSTAGRAM_ACTOR ?? 'S9A11NvceWaGorwwh').trim(),
  // Which job types this worker process handles.
  // 'transcribe' removed — it was registered + claimed but nothing ever enqueues it
  // (ingest-reference enqueues type 'ingest'). 'autoedit' removed with the old AI
  // editor. build_dna stays edge-driven (dna-poll), never add it here or the worker
  // would dead-letter it.
  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'ingest,build_voice,scrape_dna,validate_source,editor_v2').split(',').map((s) => s.trim()),
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
  speechVersion: (process.env.EDITOR_SPEECH_VERSION ?? 'speech-1').trim(),
  // ASR model for the speech component (independent of the caption/reference
  // knob so a caption tweak can never silently change component identity).
  speechModel: (process.env.EDITOR_SPEECH_MODEL ?? process.env.WHISPER_MODEL ?? 'base').trim(),
  // Hard timeouts: audio extraction is I/O-bound (minutes at worst); ASR on
  // CPU runs ~0.2-0.5x realtime for `base`, so 15 min of audio fits well
  // inside 20 min. Both stay far under the 2400s visibility lease.
  speechExtractTimeoutMs: Number(process.env.EDITOR_SPEECH_EXTRACT_TIMEOUT_MS ?? '180000'),
  speechAsrTimeoutMs: Number(process.env.EDITOR_SPEECH_ASR_TIMEOUT_MS ?? '1200000'),
  // Minimum word/VAD gap that becomes a silence CANDIDATE (evidence only).
  speechSilenceMinMs: Number(process.env.EDITOR_SPEECH_SILENCE_MIN_MS ?? '700'),
  // Matrix-only boundary holds ('before_reconcile' | 'before_download' |
  // 'during_download' | 'before_extract' | 'during_extract' | 'before_asr' |
  // 'during_asr' | 'after_persist').
  speechSlowPoint: (process.env.EDITOR_SPEECH_SLOW_POINT ?? '').trim(),
  speechSlowMs: Number(process.env.EDITOR_SPEECH_SLOW_MS ?? '4000'),

  workerId: process.env.FLY_MACHINE_ID ?? process.env.HOSTNAME ?? `worker-${process.pid}`,
}
