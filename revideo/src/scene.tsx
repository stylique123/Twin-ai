import { makeScene2D, Video, Txt } from '@revideo/2d'
import { useScene, createRef, all, tween, waitFor, easeOutCubic } from '@revideo/core'

interface Word { text: string; start: number; end: number }
interface Edl {
  baseClip: string
  words: Word[]
  highlightColor: string // hex, e.g. #23A6F5
  style: string
}

// The premium visual scene: plays the base clip (with its audio) and overlays
// word-synced, springy, designed captions read from the EDL passed in at render
// time. B-roll / transitions / Ken-Burns are layered on next; this is the proof
// scaffold that the hybrid render pipeline drives.
export default makeScene2D(function* (view) {
  const edl = useScene().variables.get<Edl>('edl', {
    baseClip: '',
    words: [],
    highlightColor: '#23A6F5',
    style: 'bold-pop',
  })()

  const clip = createRef<Video>()
  view.add(<Video ref={clip} src={edl.baseClip} play decoder={'ffmpeg'} size={[1080, 1920]} />)

  const word = createRef<Txt>()
  view.add(
    <Txt
      ref={word}
      text={''}
      fontFamily={'Anton, sans-serif'}
      fontWeight={800}
      fontSize={120}
      fill={'#ffffff'}
      stroke={'#000000'}
      lineWidth={10}
      scale={0.6}
      opacity={0}
      y={560}
    />,
  )

  let cursor = 0
  for (const w of edl.words ?? []) {
    if (w.start > cursor) {
      yield* waitFor(w.start - cursor)
      cursor = w.start
    }
    word().text((w.text || '').toUpperCase())
    word().fill('#ffffff')
    word().scale(0.6)
    word().opacity(0)
    // springy pop + highlight color as the word is spoken
    yield* all(
      tween(0.12, (v) => word().scale(0.6 + 0.7 * easeOutCubic(v))),
      tween(0.10, (v) => word().opacity(v)),
      tween(0.12, (v) => word().fill(v > 0.45 ? edl.highlightColor : '#ffffff')),
    )
    yield* waitFor(Math.max(0.06, w.end - w.start))
    cursor = w.end
  }

  // hold any remaining clip tail
  const total = clip().getDuration?.() ?? cursor
  if (total - cursor > 0.05) yield* waitFor(total - cursor)
})
