import { db, type Job } from '../db.js'
import { transcribeFromUrl } from '../media.js'
import { synthesizeVoiceFromAudio, extractKnowledgeFromAudio } from '../voice.js'

// Handles `build_voice` jobs — the audio upgrade for a brand voice.
// payload: { brand_voice_id, handle, platform, urls: string[] }
// Transcribes the creator's top videos and re-synthesizes the voice from their
// actual spoken audio, then updates the (already-ready) brand_voices.profile.
export async function handleBuildVoice(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { brand_voice_id?: string; handle?: string; platform?: string; urls?: string[] }
  const voiceId = String(p.brand_voice_id ?? '')
  const handle = String(p.handle ?? '')
  const platform = String(p.platform ?? 'tiktok')
  const urls = Array.isArray(p.urls) ? p.urls.slice(0, 5) : []
  if (!voiceId || !urls.length) throw new Error('build_voice needs brand_voice_id and urls')

  // Best-effort: skip any video that fails (private / blocked / no speech).
  const transcripts: string[] = []
  for (const url of urls) {
    try {
      const t = await transcribeFromUrl(url)
      if (t.text && t.text.trim().length > 20) transcripts.push(t.text.trim())
    } catch (err) {
      console.error('build_voice: transcript failed', url, err instanceof Error ? err.message : err)
    }
  }

  if (!transcripts.length) {
    // Nothing usable — leave the caption voice in place. Not a hard failure.
    return { upgraded: false, reason: 'no usable spoken transcripts' }
  }

  const profile = await synthesizeVoiceFromAudio(handle, platform, transcripts)

  // MERGE, don't replace: the audio re-synthesis refines the fields where SPOKEN
  // signal is strongest — tone/pacing/vocabulary/hooks and now the distinctive
  // pov/enemy/hook_patterns (a creator's real stance comes through on camera). It
  // does NOT produce the business-context fields (audience/audience_pain/
  // dream_outcome/offer/sub_niche/editing_style) — those come from captions + bio,
  // which audio lacks. Spreading audio over the existing profile keeps that
  // context and upgrades the voice itself.
  const { data: existing } = await db
    .from('brand_voices')
    .select('profile, owner_id')
    .eq('id', voiceId)
    .maybeSingle()
  const captionProfile = (existing?.profile as Record<string, unknown> | null) ?? {}
  const merged = { ...captionProfile, ...profile }

  // WHERE EACH FIELD CAME FROM. The merge above is a plain spread, so once it
  // has run nothing can tell a field derived from the creator actually
  // SPEAKING from one the caption synthesis produced — and those are not
  // remotely equal in authority.
  //
  // The caption model is INSTRUCTED never to return a blank ("COMPLETENESS IS
  // MANDATORY... a confident, specific inference is far more useful than a
  // blank", voice.ts's POSTS_SYSTEM). So when a creator's captions never say
  // what they sell, `offer` is filled with a plausible guess — and `offer` is
  // what writes the call to action on every video. Flat strings cannot carry
  // that distinction, so it was lost.
  //
  // Recorded as a SIBLING key rather than by reshaping `profile`: the flat
  // shape is read by generate-blueprint and by the frontend confirm card, and
  // breaking those to add metadata would be a poor trade.
  //
  // Three values, and the middle one is deliberately not "observed":
  //   observed_audio    — from spoken transcripts. The strongest signal there
  //                       is, and the only one here that is unambiguously an
  //                       observation.
  //   caption_synthesis — from the caption model, which is told to infer
  //                       rather than leave a gap. It MAY be observation and
  //                       it MAY be a guess, and we cannot tell which. Calling
  //                       it `observed` would grant authority it has not
  //                       earned, in exactly the fields where being wrong
  //                       costs the creator money or credibility.
  //   user_confirmed    — set elsewhere, when a human says yes.
  const audioFields = new Set(Object.keys(profile))
  const priorProvenance = (existing?.profile as { _provenance?: Record<string, string> } | null)?._provenance ?? {}
  const provenance: Record<string, string> = {}
  for (const key of Object.keys(merged)) {
    if (key.startsWith('_')) continue
    if (audioFields.has(key)) provenance[key] = 'observed_audio'
    else provenance[key] = priorProvenance[key] === 'user_confirmed' ? 'user_confirmed' : 'caption_synthesis'
  }

  // ── CREATOR KNOWLEDGE: EXTRACT IN FLIGHT, THEN LET THE SPEECH GO ─────────
  //
  // The transcripts are already in memory here and, until now, left it as
  // `audio_transcripts: <count>` — the richest substance in the system fetched,
  // read once for TONE, and dropped. That is the founding "voice-accurate,
  // content-empty" defect at its source.
  //
  // ⚖️ RETENTION IS NEVER-PERSIST. Nothing below writes a transcript anywhere.
  // The distillate is stored and the raw text goes out of scope when this
  // function returns, which is why `source_expiry` stays NULL — read downstream
  // as "never retained", the strongest state rather than a missing value.
  //
  // ⚖️ ENRICHMENT, NOT A GATE. Every failure path here leaves the voice upgrade
  // untouched. A creator whose knowledge extraction breaks must still get their
  // voice; trading a working feature for a new one is not an upgrade.
  let knowledgeStored = 0
  const ownerId = (existing as { owner_id?: string } | null)?.owner_id ?? null
  // No owner means no row can be attributed, and an unattributed claim about a
  // person is worse than none at all.
  if (ownerId) try {
    const raw = await extractKnowledgeFromAudio(handle, platform, transcripts)
    const rows = raw
      .filter((r) => typeof r?.text === 'string' && r.text.trim().length > 0)
      .slice(0, 40)
      .map((r) => ({
        owner_id: ownerId,
        voice_id: voiceId,
        kind: r.kind,
        text: r.text.trim().slice(0, 240),
        // An unreadable basis becomes `inferred` here rather than at the
        // database default, so the weakest reading is chosen where the value is
        // actually known to be junk.
        basis: ['stated', 'demonstrated', 'inferred'].includes(r.basis) ? r.basis : 'inferred',
        times_seen: Math.max(1, Math.min(50, Number(r.times_seen) || 1)),
        last_observed_at: new Date().toISOString(),
      }))
      .filter((r) => ['fact', 'opinion', 'topic', 'example', 'experience', 'framework', 'claim', 'product', 'covered'].includes(r.kind))
    if (rows.length) {
      // ⚠️ NOT AN UPSERT, AND THE REASON IS A BUG ALREADY FIXED ONCE HERE.
      // `saveMintedEntity` used `onConflict` against a PARTIAL index; Postgres
      // cannot infer an index whose predicate the statement does not repeat, and
      // PostgREST cannot express one, so every write raised 42P10 and failed
      // invisibly. `creator_knowledge_one_per_claim` is an EXPRESSION index
      // (coalesce, lower, btrim), which is uninferrable for exactly the same
      // reason. So the existing claims are read and the new ones filtered
      // against them; the index stays as the authority that makes a duplicate
      // impossible rather than merely unlikely.
      const { data: seen } = await db
        .from('creator_knowledge')
        .select('kind, text')
        .eq('owner_id', ownerId)
        .eq('voice_id', voiceId)
      const have = new Set((seen ?? []).map((r) => `${r.kind}\u0000${String(r.text).trim().toLowerCase()}`))
      const fresh = rows.filter((r) => !have.has(`${r.kind}\u0000${r.text.toLowerCase()}`))
      if (fresh.length) {
        const { error: kErr } = await db.from('creator_knowledge').insert(fresh)
        if (!kErr) knowledgeStored = fresh.length
      }
    }
  } catch {
    // Deliberately swallowed — see the enrichment note above.
  }

  const withProvenance = {
    ...merged,
    _provenance: provenance,
    _provenance_evidence: { audio_transcripts: transcripts.length, knowledge_items: knowledgeStored },
  }

  // Only upgrade a voice that's still ready (don't resurrect a deleted/failed one).
  const { error } = await db
    .from('brand_voices')
    .update({ profile: withProvenance })
    .eq('id', voiceId)
    .eq('status', 'ready')
  if (error) throw error

  return {
    upgraded: true,
    videos_used: transcripts.length,
    knowledge_items: knowledgeStored,
    fields_from_audio: audioFields.size,
    fields_from_captions: Object.values(provenance).filter((v) => v === 'caption_synthesis').length,
  }
}
