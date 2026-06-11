import { rm } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { autoEdit } from '../edit.js'
import { downloadObject, uploadObject, signObject } from '../storage.js'

// Handles `autoedit` jobs.
// payload: { generation_id?: string, take_path: string }  (take_path under takes/<uid>/…)
// Result: { output_path, output_url, duration_sec, words }
export async function handleAutoEdit(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as Record<string, unknown>
  const takePath = String(payload.take_path ?? '').trim()
  if (!takePath) throw new Error('payload.take_path is required')
  if (!job.owner_id) throw new Error('job has no owner')
  // The take must live in the owner's own folder — defense in depth.
  if (!takePath.startsWith(`${job.owner_id}/`)) throw new Error('take_path outside owner folder')

  const dir = await mkdtemp(join(tmpdir(), 'twinai-take-'))
  const localTake = join(dir, 'take.bin')
  let renderFile: string | null = null
  try {
    await downloadObject('takes', takePath, localTake)

    const { outFile, durationSec, words } = await autoEdit(localTake)
    renderFile = outFile

    const outputPath = `${job.owner_id}/${job.id}.mp4`
    await uploadObject('edits', outputPath, outFile, 'video/mp4')
    // A week-long signed URL so the browser can play/download without extra auth.
    const url = await signObject('edits', outputPath, 60 * 60 * 24 * 7)

    // Best-effort: record on the generation so the Library can show "edited".
    if (payload.generation_id) {
      await db.from('generations').update({ edit_path: outputPath }).eq('id', payload.generation_id).then(
        () => {},
        () => {},
      )
    }

    return { output_path: outputPath, output_url: url, duration_sec: durationSec, words }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    if (renderFile) await rm(renderFile, { force: true }).catch(() => {})
  }
}
