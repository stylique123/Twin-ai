import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db, updateJobProgress, type Job } from '../db.js'
import { env } from '../env.js'
import { autoEdit, applyWatermark, applyLogo } from '../edit.js'
import type { EditDecisionList } from '../edl.js'
import { downloadObject, uploadObject, signObject } from '../storage.js'

// Handles `autoedit` jobs.
// payload: { generation_id?: string, take_path: string, skip_captions?: boolean }
// Result: { output_path, output_url, duration_sec, words, jump_cut }
export async function handleAutoEdit(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>
  const takePath = String(payload.take_path ?? '').trim()
  if (!takePath) throw new Error('payload.take_path is required')
  if (!job.owner_id) throw new Error('job has no owner')
  if (!takePath.startsWith(`${job.owner_id}/`)) throw new Error('take_path outside owner folder')

  // Cost instrumentation: render wall-time per job, so $/video per cohort is
  // measurable (the financial panel's "you can't manage a margin you don't measure").
  const t0 = Date.now()

  // Preserve the source extension so ffmpeg/auto-editor detect the container.
  const ext = (takePath.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const dir = await mkdtemp(join(tmpdir(), 'twinai-take-'))
  const localTake = join(dir, `take.${ext}`)
  let renderFile: string | null = null
  let thumbRender: string | null = null
  let wmFile: string | null = null
  let logoOut: string | null = null
  try {
    await downloadObject('takes', takePath, localTake)

    // Team seats: watermark + free-export follow the WORKSPACE owner's plan, not the
    // teammate's. Storage paths still use job.owner_id (the take lives in their folder).
    let planOwner = job.owner_id
    try {
      const { data: m } = await db.from('workspace_members').select('owner_id').eq('member_id', job.owner_id).maybeSingle()
      if (m?.owner_id) planOwner = m.owner_id
    } catch { /* fall back to the take owner */ }

    // Watermark policy: a free user's FIRST export is CLEAN (so they can verify the
    // real output before paying — the panel's #1 ask); every export AFTER that
    // carries a subtle TwinAI mark. Paid users are never watermarked. Fail-open to
    // clean if the profile read hiccups.
    let applyWm = false
    let markFreeClean = false
    try {
      const { data: prof } = await db.from('profiles').select('plan, free_export_used').eq('id', planOwner).maybeSingle()
      const isFree = !prof?.plan || prof.plan === 'free'
      if (isFree) {
        if (prof?.free_export_used) {
          applyWm = true
        } else {
          // The one free CLEAN export is now gated on a CONFIRMED EMAIL so burner-
          // email farms can't harvest unlimited free clean exports (the financial
          // panel's margin-leak fix). Google OAuth + confirmed signups already pass;
          // unverified throwaways get the watermark. Conservative on lookup failure.
          let verified = false
          try {
            const { data: u } = await db.auth.admin.getUserById(planOwner)
            verified = !!((u?.user as { email_confirmed_at?: string; confirmed_at?: string } | undefined)?.email_confirmed_at
              ?? (u?.user as { confirmed_at?: string } | undefined)?.confirmed_at)
          } catch { /* can't verify → watermark */ }
          if (verified) markFreeClean = true
          else applyWm = true
        }
      }
    } catch { /* default: no watermark */ }

    // Smart decision: read the user's brand-DNA pacing + the reference's format
    // and auto-pick the edit energy (high → jump-zoom punches; calm → clean cuts).
    let energy: 'high' | 'calm' = 'calm'
    let brollText = ''
    let coverText = ''
    let scriptText = ''
    let brandStyle: string | undefined
    let brandColor: number | undefined
    let brandLogoPath: string | undefined
    if (payload.generation_id) {
      try {
        const { data: gen } = await db
          .from('generations')
          .select('blueprint, brand_voice_id, selected_hook, edit_style')
          .eq('id', payload.generation_id)
          .maybeSingle()
        const bp = gen?.blueprint as Record<string, unknown> | null
        const fmt = ((bp?.reference_read as { format_label?: string } | undefined)?.format_label) ?? ''
        // The creator picks which hook to shoot; that hook drives the cover and
        // leads the b-roll keyword source so cutaways match what they actually said.
        const chosenHook = (gen?.selected_hook as string | undefined) ?? ((bp?.hook_options as string[] | undefined) ?? [])[0] ?? ''
        // Content-aware b-roll: derive keywords from the blueprint the creator is
        // actually shooting (chosen hook first, then script + captions + shot list),
        // not just the transcript word-frequency, so cutaways match the content.
        brollText = [
          chosenHook,
          ...(((bp?.script as { line?: string }[] | undefined) ?? []).map((s) => s?.line ?? '')),
          ...((bp?.captions as string[] | undefined) ?? []),
          ...(((bp?.shot_list as { shot?: string; notes?: string }[] | undefined) ?? []).map((s) => `${s?.shot ?? ''} ${s?.notes ?? ''}`)),
        ].filter(Boolean).join(' ').slice(0, 4000)
        coverText = chosenHook.slice(0, 120)
        // The spoken script lines only — the caption fallback for no-speech takes.
        scriptText = (((bp?.script as { line?: string }[] | undefined) ?? []).map((s) => s?.line ?? '').filter(Boolean).join(' ')).slice(0, 2000)
        // Pull the workspace brand kit + voice once: the kit themes the caption
        // style/color on new edits; the voice pacing tunes the energy default.
        let pacing = ''
        if (gen?.brand_voice_id) {
          const { data: bv } = await db.from('brand_voices').select('profile, brand_kit').eq('id', gen.brand_voice_id).maybeSingle()
          pacing = (bv?.profile as { pacing?: string } | null)?.pacing ?? ''
          const kit = bv?.brand_kit as { caption_style?: string; color?: number; logo_path?: string } | null
          if (kit?.caption_style) brandStyle = kit.caption_style
          if (typeof kit?.color === 'number' && !Number.isFinite(payload.variation as number)) brandColor = kit.color
          if (kit?.logo_path) brandLogoPath = kit.logo_path
        }
        // Edit style the creator picked takes priority over the DNA-derived energy.
        const style = (gen?.edit_style as string | undefined) ?? ''
        if (style === 'punchy') energy = 'high'
        else if (style === 'clean' || style === 'cinematic') energy = 'calm'
        else if (/fast|quick|rapid|punch|energetic|aggressive|hype|high.?energy|snappy|no dead air/i.test(`${pacing} ${fmt}`)) {
          energy = 'high'
        }
      } catch {
        /* fall back to calm */
      }
    }

    // Remakes pass a variation index; else fall back to the brand-kit color, else 0.
    const variation = Number.isFinite(payload.variation as number) ? Number(payload.variation) : (brandColor ?? 0)
    if (variation % 2 === 1) energy = energy === 'high' ? 'calm' : 'high'

    // Manual re-render: when the Refine panel sends an edited EDL, render straight
    // from it (no re-detect / re-transcribe) so the creator's tweaks are applied.
    const editedEdl = (payload.edl ?? undefined) as EditDecisionList | undefined
    // Premium (Revideo) pass runs on the FIRST edit only. Remakes (variation > 0)
    // and Refines (an edited EDL) are cheap iterations — the instant ffmpeg result
    // is what the creator wants, so we skip the expensive render. This caps render
    // COGS at ~one premium pass per blueprint and makes remakes nearly free.
    const isFirstEdit = variation === 0 && !editedEdl
    const { outFile, durationSec, words, jumpCut, broll, thumbFile, edl, baseRevideoFile } = await autoEdit(localTake, {
      captions: payload.skip_captions !== true,
      energy,
      variation,
      captionStyle: brandStyle,
      brollText,
      coverText,
      scriptText,
      edl: editedEdl,
      // Skip the premium pass when watermarking so the burned-in mark stands (the
      // separate Revideo service wouldn't carry it). Watermarked = free, non-first export.
      produceRevideoBase: !!env.revideoUrl && isFirstEdit && !applyWm,
      onProgress: (phase, pct, label) => { void updateJobProgress(job.id, { phase, pct, label }) },
    })
    renderFile = outFile
    thumbRender = thumbFile ?? null
    console.log(`[autoedit ${job.id}] coverText_len=${coverText.length} thumb=${thumbRender ? 'yes' : 'no'} broll=${broll} wm=${applyWm}`)

    // Burn the watermark as an isolated pass (fail-safe: returns the clean file on error).
    let finalFile = outFile
    if (applyWm) {
      const wm = await applyWatermark(outFile)
      if (wm !== outFile) { wmFile = wm; finalFile = wm }
    }

    // Brand logo burn-in (every package): a discrete, fail-open overlay pass — a
    // logo problem returns the clean render, never breaks the export.
    if (brandLogoPath) {
      try {
        const logoLocal = join(dir, 'logo.png')
        await downloadObject('edits', brandLogoPath, logoLocal)
        const withLogo = await applyLogo(finalFile, logoLocal)
        if (withLogo !== finalFile) { logoOut = withLogo; finalFile = withLogo }
      } catch (e) {
        console.error(`[autoedit ${job.id}] logo overlay skipped:`, e instanceof Error ? e.message : e)
      }
    }

    const outputPath = `${job.owner_id}/${job.id}.mp4`
    await uploadObject('edits', outputPath, finalFile, 'video/mp4')
    const url = await signObject('edits', outputPath, 60 * 60 * 24 * 7)
    // This free user just received their one clean export — mark it consumed so the
    // next one is watermarked. Best-effort; never fails the render.
    if (markFreeClean) {
      await db.from('profiles').update({ free_export_used: true }).eq('id', planOwner).then(() => {}, () => {})
    }

    // Upload the cover thumbnail (best-effort) and record its path.
    let thumbUrl: string | null = null
    if (thumbRender) {
      try {
        const thumbPath = `${job.owner_id}/${job.id}-thumb.jpg`
        await uploadObject('edits', thumbPath, thumbRender, 'image/jpeg')
        thumbUrl = await signObject('edits', thumbPath, 60 * 60 * 24 * 7)
        if (payload.generation_id) {
          await db.from('generations').update({ thumb_path: thumbPath }).eq('id', payload.generation_id).then(() => {}, () => {})
        }
      } catch {
        thumbUrl = null
      }
    }

    // Persist the Edit Decision List next to the render so the manual editor can
    // load it. Best-effort: a failed EDL upload never fails the render itself.
    let edlPath: string | null = null
    try {
      const edlLocal = join(dir, 'edit.edl.json')
      await writeFile(edlLocal, JSON.stringify(edl))
      edlPath = `${job.owner_id}/${job.id}.edl.json`
      await uploadObject('edits', edlPath, edlLocal, 'application/json')
    } catch {
      edlPath = null
    }

    // Record the render + the take + the EDL on the generation so Refine can be
    // opened later from the Result/Library for THIS video (not just post-record).
    if (payload.generation_id) {
      await db.from('generations')
        .update({ edit_path: outputPath, take_path: takePath, edl_path: edlPath })
        .eq('id', payload.generation_id)
        .then(() => {}, () => {})

      // Tell the creator their video is ready — covers the common case where they
      // navigated away during the ~1-2 min render. Best-effort; never fails the job.
      await db.from('notifications').insert({
        user_id: job.owner_id,
        type: 'video_ready',
        title: 'Your video is ready',
        body: 'Your edit finished rendering. Tap to watch, then publish.',
        link: `/result/${payload.generation_id}`,
      }).then(() => {}, () => {})
    }

    // ---- Premium pass (one flow): the ffmpeg result above is the INSTANT result,
    // already saved. Now draw premium animated captions over the graded base via the
    // Revideo service and upgrade the edit IN PLACE. Best-effort — on any failure the
    // ffmpeg result stands (instant always wins, premium is the finisher).
    let finalUrl = url
    if (env.revideoUrl && baseRevideoFile) {
      // Surface the instant result so the UI can play it while premium renders.
      void updateJobProgress(job.id, { phase: 'premium', pct: 88, label: 'Polishing premium captions…', instant_url: url })
      try {
        const basePath = `${job.owner_id}/${job.id}-base.mp4`
        await uploadObject('edits', basePath, baseRevideoFile, 'video/mp4')
        const baseUrl = await signObject('edits', basePath, 60 * 30)
        const r = await fetch(`${env.revideoUrl}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseClipUrl: baseUrl, edl }),
          signal: AbortSignal.timeout(env.revideoTimeoutMs),
        })
        if (!r.ok) throw new Error(`revideo ${r.status}: ${(await r.text()).slice(0, 200)}`)
        const premiumBuf = Buffer.from(await r.arrayBuffer())
        if (premiumBuf.byteLength < 2048) throw new Error('premium render too small')
        const premiumLocal = join(dir, 'premium.mp4')
        await writeFile(premiumLocal, premiumBuf)
        // Overwrite the same edit path → the result is upgraded in place to premium.
        await uploadObject('edits', outputPath, premiumLocal, 'video/mp4')
        finalUrl = await signObject('edits', outputPath, 60 * 60 * 24 * 7)
        console.log(`[autoedit ${job.id}] premium pass OK (${premiumBuf.byteLength} bytes)`)
      } catch (e) {
        console.error(`[autoedit ${job.id}] premium pass failed, keeping ffmpeg result:`, e)
      }
    }

    // Data layer: record the render + the editing time it saved (≈90 min on the
    // first edit; remakes/refines don't re-bank the saving). Best-effort.
    await db.from('analytics_events')
      .insert({ user_id: job.owner_id, event: 'edit_rendered', time_saved_minutes: isFirstEdit ? 90 : 0, props: { generation_id: payload.generation_id ?? null, premium: finalUrl !== url, variation } })
      .then(() => {}, () => {})

    // Per-job cost signal: wall-time + the output length, so blended $/video and
    // margin can be tracked per cohort. Best-effort — never affects the render.
    const renderMs = Date.now() - t0
    await db.from('ops_events')
      .insert({ kind: 'render_cost', severity: 'info', user_id: job.owner_id, detail: { generation_id: payload.generation_id ?? null, render_ms: renderMs, output_sec: durationSec, watermarked: applyWm } })
      .then(() => {}, () => {})

    return { output_path: outputPath, output_url: finalUrl, duration_sec: durationSec, words, jump_cut: jumpCut, broll, thumb_url: thumbUrl, edl_path: edlPath }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    if (renderFile) await rm(renderFile, { force: true }).catch(() => {})
    if (wmFile) await rm(wmFile, { force: true }).catch(() => {})
    if (logoOut) await rm(logoOut, { force: true }).catch(() => {})
    if (thumbRender) await rm(thumbRender, { force: true }).catch(() => {})
  }
}
