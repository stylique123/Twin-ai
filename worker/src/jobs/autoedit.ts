import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { autoEdit } from '../edit.js'
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
  try {
    await downloadObject('takes', takePath, localTake)

    const { outFile, durationSec, words, jumpCut } = await autoEdit(localTake, {
      captions: payload.skip_captions !== true,
    })
    renderFile = outFile

    const outputPath = `${job.owner_id}/${job.id}.mp4`
    await uploadObject('edits', outputPath, outFile, 'video/mp4')
    const url = await signObject('edits', outputPath, 60 * 60 * 24 * 7)

    if (payload.generation_id) {
      await db.from('generations').update({ edit_path: outputPath }).eq('id', payload.generation_id).then(
        () => {},
        () => {},
      )
    }

    return { output_path: outputPath, output_url: url, duration_sec: durationSec, words, jump_cut: jumpCut }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    if (renderFile) await rm(renderFile, { force: true }).catch(() => {})
  }
}
