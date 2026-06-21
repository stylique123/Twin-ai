import { makeProject } from '@revideo/core'
import scene from './scene'

// Vertical 1080x1920, 30fps, mp4 via the bundled ffmpeg exporter. Resolution can
// also be overridden per-render via renderVideo settings.projectSettings.
export default makeProject({
  scenes: [scene],
  settings: {
    shared: {
      size: { x: 1080, y: 1920 },
      background: '#000000',
    },
    rendering: {
      exporter: { name: '@revideo/core/ffmpeg', options: { format: 'mp4' } },
      fps: 30,
    },
  },
})
