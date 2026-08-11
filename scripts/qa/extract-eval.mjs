#!/usr/bin/env node
// DOES THE KNOWLEDGE EXTRACTOR ACTUALLY WORK ON SPEECH?
//
// `extractKnowledgeFromAudio` typechecks and is wired, and until this script ran
// it had never read a transcript. Everything proven about Creator Knowledge so
// far was proven about the WRITER using hand-written fixture knowledge; nothing
// tested whether the thing that produces that knowledge can find any.
//
// ⚠️ THE SYSTEM PROMPT IS LIFTED, NEVER RETYPED — the rule this harness family
// has already broken twice, once for `promotes` and once for the count contract,
// each time producing a "finding" that was really a paraphrase. `liftConst`
// exits non-zero rather than falling back.
//
// TWO FIXTURES, AND THE SECOND MATTERS MORE. One transcript carries real
// substance; the other is fluent, confident and says nothing checkable. An
// extractor that returns five confident items for the second one is the DNA
// extractor's "COMPLETENESS IS MANDATORY" failure rebuilt, and it would put
// invented positions in a creator's mouth wearing a `stated` basis.
//
//   GEMINI_API_KEY=... node scripts/qa/extract-eval.mjs
import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }

const SRC = readFileSync('worker/src/voice.ts', 'utf8')
function liftConst(name) {
  const m = SRC.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`\\n`, 'm'))
  if (!m) {
    console.error(`FATAL: could not lift ${name} from worker/src/voice.ts.`)
    console.error('This harness will not run on a paraphrase. Fix the marker, do not inline the text.')
    process.exit(1)
  }
  return m[1]
}
const KNOWLEDGE_SYSTEM = liftConst('KNOWLEDGE_SYSTEM')

// A creator saying checkable things — positions, a method, a personal history,
// and one subject they explicitly say they have already covered.
const SUBSTANTIVE = [
  `Everyone obsesses over megapixels and honestly it's the least useful number on the box.
   I've tested phones with 200 megapixel sensors that produce worse photos than a three year
   old iPhone, because the processing matters more than the sensor. What I actually care about
   is battery. If I can't get through a full day of shooting, nothing else matters. I made a
   whole video about why I stopped upgrading every year, so I won't repeat it here.`,
  `I've reviewed every foldable that has shipped in the last four years and the hinge is still
   the thing that fails first. I had one develop a crease after six weeks of normal use. My rule
   now is simple: I use a phone as my only device for two weeks before I say anything about it.
   That's the only way you find the things a spec sheet hides.`,
  `The thing people get wrong about charging speed is that faster is not better for the battery.
   I've measured capacity loss across a year on the same model charged two different ways and the
   difference was real. Slow overnight charging kept noticeably more capacity.`,
]

// A creator who NAMES THINGS — tools, models, prices. This fixture exists to
// answer a question the first two could not: is the `product` kind reachable at
// all, or is it a category the extractor never picks? The substantive fixture
// above names almost no brand, so its zero product items proved nothing.
const NAMED = [
  `I dropped Notion for Obsidian about six months ago and I'm not going back. Notion got slow
   once my vault passed a few thousand notes, and Obsidian is local-first so it just opens. I
   still pay for Todoist because nothing else does natural language dates as well.`,
  `The M4 iPad Pro is the one I actually recommend now, but only the 512 gig model, because
   that's where you get the extra RAM. I tested Final Cut on the 256 and it choked on a
   multicam timeline that the 512 handled fine.`,
]

// Fluent, confident, and says nothing that could be checked or attributed.
// ⚖️ THE HARDER TEST. The correct output here is few items or none.
const EMPTY = [
  `Hey guys, welcome back to the channel. So today's video is going to be a big one, I'm really
   excited about it. Make sure you smash that like button and subscribe if you haven't already.
   Let's get straight into it.`,
  `And that's basically it, guys. Let me know what you think down in the comments. I read all of
   them. If you enjoyed this one you're going to love the next one, so hit subscribe. It's been
   great, and I'll see you in the next video.`,
]


// REAL CAPTIONS, read off the owner-supplied channel pages. This is the source
// the caption extractor exists for: Johnny's titles name three phones in three
// thumbnails, and none of that reaches the system today.
const CAPTIONS = [
  "I BOUGHT SAMSUNG'S PASSPORT SIZED FOLDABLE (SAMSUNG Z FOLD 8)",
  'FIXING THE PHONE GOOGLE DOESN\'T WANT YOU TO BUY (FAIL)',
  "THE PHONE GOOGLE DOESN'T WANT YOU TO BUY - GOOGLE PIXEL (1ST GEN)",
  "I'M GIVING AWAY AN IPHONE 14 PRO MAX - HERE'S HOW YOU ENTER",
  'I BOUGHT THE MOST UNIQUE SAMSUNG PHONE?!! SAMSUNG A80',
  'I BOUGHT A BROKEN IPHONE 14 PRO MAX TO GIVE TO YOU',
]

async function extract(label, transcripts, system) {
  const corpus = transcripts.map((t, i) => `--- VIDEO ${i + 1} (spoken) ---\n${t}`).join('\n\n')
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system ?? KNOWLEDGE_SYSTEM }] },
        contents: [{ parts: [{ text: `CREATOR: @tester on youtube\nSPOKEN TRANSCRIPTS:\n${corpus}\n\nRecord what this creator knows, believes, has done, and has already covered.` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 8000,
          responseSchema: {
            type: 'OBJECT',
            properties: {
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    kind: { type: 'STRING' }, text: { type: 'STRING' },
                    basis: { type: 'STRING' }, times_seen: { type: 'STRING' },
                    confidence: { type: 'STRING' }, source_video: { type: 'STRING' },
                  },
                  required: ['kind', 'text', 'basis', 'times_seen', 'confidence', 'source_video'],
                },
              },
            },
            required: ['items'],
          },
        },
      }),
    })
  const j = await r.json()
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) return { label, error: j?.error?.message ?? 'no text' }
  try { return { label, items: JSON.parse(txt).items ?? [] } } catch { return { label, error: 'unparseable' } }
}

const out = []
const CAPTION_SYSTEM = liftConst('CAPTION_SYSTEM')
for (const [label, t] of [['SUBSTANTIVE', SUBSTANTIVE], ['NAMED', NAMED], ['EMPTY', EMPTY]]) {
  out.push(await extract(label, t))
}
out.push(await extract('CAPTIONS(johnny)', CAPTIONS, CAPTION_SYSTEM))
console.log(JSON.stringify(out, null, 2))
