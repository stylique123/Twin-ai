// PLAN 2.3 EVAL: label one creator's stored transcripts with the model and
// score `complete` against a hand key. Prints ids, booleans and the score only:
// never transcript text. Reads only; writes nothing.
//   OWNER_ID=<uuid> COMPLETE_IDS=<id8,id8,...> ONLY_IDS=<optional id8 list>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORY_CLASSIFY_SYSTEM, STORY_CLASSIFY_SCHEMA, buildStoryClassifyPrompt, parseStoryLabels, scoreStoryLabels } from '../../packages/shared/src/script/storyClassify.ts'
import { isCompleteStory } from '../../packages/shared/src/script/passages.ts'

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v }
const routing = JSON.parse(readFileSync(join(process.cwd(), 'worker', 'model_routing_v1.json'), 'utf8'))
const model: string = process.env.GEMINI_FAST_MODEL || routing.taskClasses.extract.model
const owner = env('OWNER_ID')
const key = new Set(env('COMPLETE_IDS').split(',').map((s) => s.trim()).filter(Boolean))
const only = (process.env.ONLY_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

async function main(): Promise<void> {
const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/transcripts?select=id,segments&owner_id=eq.${owner}`, {
  headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` },
})
const rows = (await res.json()) as Array<{ id: string; segments: Array<{ start?: number; text?: string }> | null }>
const items = rows
  .map((r) => ({ id: r.id.slice(0, 8), text: (r.segments ?? []).slice().sort((a, b) => (a.start ?? 0) - (b.start ?? 0)).map((s) => s.text ?? '').join(' ') }))
  .filter((t) => (only.length ? only.includes(t.id) : t.text.split(/\s+/).length >= 25))

const body = {
  systemInstruction: { parts: [{ text: STORY_CLASSIFY_SYSTEM }] },
  contents: [{ role: 'user', parts: [{ text: buildStoryClassifyPrompt(items) }] }],
  generationConfig: { responseMimeType: 'application/json', responseSchema: STORY_CLASSIFY_SCHEMA, temperature: 0 },
}
const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env('GEMINI_API_KEY')}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const gj = await g.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
const txt = gj.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
const labels = parseStoryLabels(JSON.parse(txt), items.map((t) => t.id))
for (const l of labels) {
  const rule = isCompleteStory(items.find((t) => t.id === l.id)!.text)
  const line = `${l.id} model=${l.complete ? 'COMPLETE' : '-'} a=${+l.anchor} t=${+l.turn} r=${+l.resolution} rule=${rule ? 'COMPLETE' : '-'} key=${key.has(l.id) ? 'COMPLETE' : '-'}`
  console.log(line)
  // Readable through the checks API (job logs are not): ids and booleans only.
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=story-eval::${line}`)
}
const s = scoreStoryLabels(labels, key)
const summary = `model: n=${labels.length} tp=${s.tp} fp=${s.fp} fn=${s.fn} precision=${s.precision.toFixed(2)} recall=${s.recall.toFixed(2)} (model ${model})`
console.log(summary)
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=story-eval-score::${summary}`)
}

main().catch((e) => { console.error(String(e)); process.exit(1) })
