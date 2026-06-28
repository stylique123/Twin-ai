import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { generateBlueprint, getJob, ingestReference } from '@twinai/shared'
import { Body, Button, Eyebrow, Field, H1, Screen } from '../src/components/ui'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Create() {
  const router = useRouter()
  // Prefilled when arriving from a Gallery "Remix this" tap.
  const params = useLocalSearchParams<{ url?: string }>()
  const [url, setUrl] = useState(params.url ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (!url.trim()) { setErr('Paste a video link first.'); return }
    setBusy(true); setErr(null)
    try {
      setStatus('Reading the reference…')
      const { jobId, transcriptId } = await ingestReference(url.trim())
      let transcript_id = transcriptId

      // Poll the worker until the transcript is ready (skipped on cache hit).
      if (!transcript_id) {
        for (let i = 0; i < 60; i++) {
          const job = await getJob(jobId)
          if (job?.status === 'done') { transcript_id = job.result?.transcript_id; break }
          if (job?.status === 'failed') throw new Error(job.error || 'Could not read that video')
          setStatus('Transcribing the reference…')
          await sleep(3000)
        }
      }

      setStatus('Writing your blueprint…')
      const gen = await generateBlueprint({
        reference_url: url.trim(),
        reference_note: note.trim(),
        fidelity: 'balanced',
        ...(transcript_id ? { transcript_id } : {}),
      })
      router.replace(`/blueprint/${gen.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false); setStatus(null)
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Create' }} />
      <Eyebrow>New video</Eyebrow>
      <H1>Remix a reference</H1>
      <Body muted>Paste a Reel, TikTok, Short or YouTube link. We copy the structure, never the content.</Body>
      <View style={{ height: 8 }} />
      <Field label="Reference link" value={url} onChangeText={setUrl} placeholder="https://tiktok.com/@…/video/…" keyboardType="url" />
      <Field label="Anything to add? (optional)" value={note} onChangeText={setNote} placeholder="Make it about my SaaS launch" />
      {status ? <Body muted>{status}</Body> : null}
      {err ? <Body>{`⚠ ${err}`}</Body> : null}
      <View style={{ height: 8 }} />
      <Button label="Make my blueprint" onPress={run} loading={busy} />
    </Screen>
  )
}
