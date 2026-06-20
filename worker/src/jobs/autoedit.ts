import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { autoEdit } from '../edit.js'
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

  // Preserve the source extension so ffmpeg/auto-editor detect the container.
  const ext = (takePath.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const dir = await mkdtemp(join(tmpdir(), 'twinai-take-'))
  const localTake = join(dir, `take.${ext}`)
  let renderFile: string | null = null
  let thumbRender: string | null = null
  try {
    await downloadObject('takes', takePath, localTake)

    // Smart decision: read the user's brand-DNA pacing + the reference's format
    // and auto-pick the edit energy (high → jump-zoom punches; calm → clean cuts).
    let energy: 'high' | 'calm' = 'calm'
    let brollText = ''
    let coverText = ''
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
        // Edit style the creator picked takes priority over the DNA-derived energy.
        const style = (gen?.edit_style as string | undefined) ?? ''
        if (style === 'punchy') energy = 'high'
        else if (style === 'clean' || style === 'cinematic') energy = 'calm'
        else {
          let pacing = ''
          if (gen?.brand_voice_id) {
            const { data: bv } = await db.from('brand_voices').select('profile').eq('id', gen.brand_voice_id).maybeSingle()
            pacing = (bv?.profile as { pacing?: string } | null)?.pacing ?? ''
          }
          if (/fast|quick|rapid|punch|energetic|aggressive|hype|high.?energy|snappy|no dead air/i.test(`${pacing} ${fmt}`)) {
            energy = 'high'
          }
        }
      } catch {
        /* fall back to calm */
      }
    }

    // Remakes pass a variation index; alternate energy on odd remakes for variety.
    const variation = Number.isFinite(payload.variation as number) ? Number(payload.variation) : 0
    if (variation % 2 === 1) energy = energy === 'high' ? 'calm' : 'high'

    // Manual re-render: when the Refine panel sends an edited EDL, render straight
    // from it (no re-detect / re-transcribe) so the creator's tweaks are applied.
    const editedEdl = (payload.edl ?? undefined) as EditDecisionList | undefined
    const { outFile, durationSec, words, jumpCut, broll, thumbFile, edl } = await autoEdit(localTake, {
      captions: payload.skip_captions !== true,
      energy,
      variation,
      brollText,
      coverText,
      edl: editedEdl,
    })
    renderFile = outFile
    thumbRender = thumbFile ?? null
    console.log(`[autoedit ${job.id}] coverText_len=${coverText.length} thumb=${thumbRender ? 'yes' : 'no'} broll=${broll}`)

    const outputPath = `${job.owner_id}/${job.id}.mp4`
    await uploadObject('edits', outputPath, outFile, 'video/mp4')
    const url = await signObject('edits', outputPath, 60 * 60 * 24 * 7)

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

    if (payload.generation_id) {
      await db.from('generations').update({ edit_path: outputPath }).eq('id', payload.generation_id).then(
        () => {},
        () => {},
      )
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

    return { output_path: outputPath, output_url: url, duration_sec: durationSec, words, jump_cut: jumpCut, broll, thumb_url: thumbUrl, edl_path: edlPath }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    if (renderFile) await rm(renderFile, { force: true }).catch(() => {})
    if (thumbRender) await rm(thumbRender, { force: true }).catch(() => {})
  }
}
