// A CLAIM WITHOUT ITS FRAME IS AN OPINION.
//
// ⚠️ THE VISUAL PASS DELETED ITS OWN EVIDENCE. `runVisualPass` sampled frames
// into a temp directory, sent them to the model, and removed the directory in
// its `finally`. The profile that came back cites `frame 2`; frame 2 no longer
// existed anywhere. Every visual field was therefore an assertion nobody could
// check, which is the difference between a finding and an opinion.
//
// ⚖️ AND RE-SAMPLING IS NOT RECOVERY. Getting frame 2 back means downloading the
// video again: it costs again, it can fail on an IP block that did not exist at
// sample time, and a re-sample landing a third of a second later is not the
// evidence the model saw. Evidence you have to re-acquire is a re-enactment.
//
// ⚠️ SO PERSISTENCE HAPPENS BEFORE THE MODEL CALL, NOT AFTER IT. Uploading
// afterwards would spend the call first and then discover the frames could not
// be kept, leaving exactly the unverifiable claims this module exists to
// prevent. If the frames cannot be stored, the pass does not run.
//
// ⚖️ THE CORPUS IS NOT A PRODUCT SURFACE. These are frames of thousands of other
// creators' videos. The bucket is private and the table grants no client role,
// same posture as reference_transcripts. The labelling packet reads them through
// short-lived signed URLs, never a standing grant.

import { createHash } from 'node:crypto'
import { db } from './db.js'
import type { FrameSample } from './frameSample.js'

export const FRAMES_BUCKET = 'reference-frames'

/** ⚠️ A URL IS NOT A STORAGE KEY. Reference urls carry `/`, `?` and `&`, which
 *  would invent directories and truncate names. The digest is stable, so the
 *  same reference lands in the same folder on every re-sample and the unique
 *  index has something to conflict with. */
export const frameObjectPath = (url: string, frameIndex: number, mimeType: string): string => {
  const key = createHash('sha256').update(url).digest('hex')
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  return `${key}/${String(frameIndex).padStart(2, '0')}.${ext}`
}

export const frameDigest = (base64: string): string =>
  createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex')

export interface PersistedFrames {
  stored: number
  /** ⚠️ NULL IS NOT ZERO. `null` means persistence was never attempted; `0`
   *  means it was attempted and nothing landed. The second must stop the pass. */
  failure: string | null
}

/**
 * Store the frames the model is about to be shown.
 *
 * ⚠️ ALL OR NOTHING, PER REFERENCE. A partial upload would let a claim cite
 * frame 3 while only frames 1 and 2 exist — an ambiguity strictly worse than
 * having no frames, because it looks like evidence.
 */
export async function persistFrames(url: string, sample: FrameSample): Promise<PersistedFrames> {
  if (sample.framesSampled === 0) return { stored: 0, failure: 'NO_FRAMES_SAMPLED' }

  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < sample.frames.length; i++) {
    const frame = sample.frames[i]
    // ⚠️ ONE-BASED, BECAUSE THAT IS WHAT THE MODEL WAS TOLD TO CITE. `frame 2`
    // in a visual claim means the second frame. Storing it zero-based would
    // silently re-point every citation already written.
    const frameIndex = i + 1
    const path = frameObjectPath(url, frameIndex, frame.mimeType)
    const bytes = Buffer.from(frame.data, 'base64')
    const { error } = await db.storage.from(FRAMES_BUCKET)
      .upload(path, bytes, { contentType: frame.mimeType, upsert: true })
    if (error) return { stored: 0, failure: `FRAME_UPLOAD_FAILED: ${error.message}` }
    rows.push({
      url,
      frame_index: frameIndex,
      // ⚖️ WHERE IN THE CLIP IT CAME FROM. A sample that clusters is a sample
      // whose temporal claims are weaker than their citations suggest, and that
      // is only visible if each frame says when it was.
      at_seconds: Number((sample.atSeconds[i] ?? 0).toFixed(3)),
      schedule_basis: sample.scheduleBasis,
      storage_path: path,
      bytes: bytes.length,
      sha256: frameDigest(frame.data),
    })
  }

  const { error } = await db.from('reference_frames')
    .upsert(rows, { onConflict: 'url,frame_index' })
  if (error) return { stored: 0, failure: `FRAME_ROWS_FAILED: ${error.message}` }
  return { stored: rows.length, failure: null }
}
