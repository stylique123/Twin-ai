import { Video, Txt, makeScene2D } from '@revideo/2d'
import { createRef, useScene, all, tween, waitFor, easeOutCubic, makeProject } from '@revideo/core'

// The premium visual scene. CRITICAL: makeScene2D's FIRST arg is the scene NAME —
// omitting it crashes the renderer ("reading 'name' of undefined"). The base clip
// must be a FETCHABLE URL (Revideo can't resolve raw local file paths); the worker
// passes a signed storage URL. Verified rendering on the VPS (≈6s startup + ~7.5s
// per second of video).
const scene = makeScene2D('captions', function* (view) {
  const edl = useScene().variables.get('edl', {
    baseClip: '',
    words: [] as { text: string; start: number; end: number }[],
    highlightColor: '#23A6F5',
    style: 'bold-pop',
  })()

  const clip = createRef<Video>()
  view.add(<Video ref={clip} src={edl.baseClip} play decoder={'ffmpeg'} size={['100%', '100%']} />)

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
    // springy pop + highlight as the word is spoken
    yield* all(
      tween(0.12, (v) => word().scale(0.6 + 0.7 * easeOutCubic(v))),
      tween(0.1, (v) => word().opacity(v)),
      tween(0.12, (v) => word().fill(v > 0.45 ? edl.highlightColor : '#ffffff')),
    )
    yield* waitFor(Math.max(0.06, w.end - w.start))
    cursor = w.end
  }
})

export default makeProject({
  scenes: [scene],
  settings: {
    shared: { size: { x: 1080, y: 1920 } },
    rendering: { exporter: { name: '@revideo/core/ffmpeg', options: { format: 'mp4' } }, fps: 30 },
  },
})
