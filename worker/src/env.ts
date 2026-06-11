// Worker configuration — all server-side. The worker holds the Supabase SERVICE
// ROLE key (never shipped to any client) and the provider keys.
function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

export const env = {
  supabaseUrl: need('SUPABASE_URL'),
  serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  geminiKey: process.env.GEMINI_API_KEY ?? '',

  // Which job types this worker process handles.
  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'ingest,transcribe,build_voice,autoedit').split(',').map((s) => s.trim()),
  // Poll cadence + claim concurrency.
  pollMs: Number(process.env.WORKER_POLL_MS ?? '3000'),
  visibilitySecs: Number(process.env.WORKER_VISIBILITY_SECS ?? '900'),

  // ASR
  whisperModel: process.env.WHISPER_MODEL ?? 'small', // tiny|base|small|medium
  whisperDevice: process.env.WHISPER_DEVICE ?? 'cpu', // cpu|cuda
  maxMediaSecs: Number(process.env.WORKER_MAX_MEDIA_SECS ?? '900'), // skip > 15 min by default

  workerId: process.env.FLY_MACHINE_ID ?? process.env.HOSTNAME ?? `worker-${process.pid}`,
}
