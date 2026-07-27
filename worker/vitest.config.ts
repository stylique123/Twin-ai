import { defineConfig } from 'vitest/config'

// The DEFAULT worker suite: every offline unit test, and nothing that renders.
//
// `src/__tests__/media/**` is excluded deliberately. Those tests execute real
// ffmpeg and are only meaningful under the pinned 5.1 major inside the worker
// image; leaving them in the default include would make `npm test` fail on any
// developer machine carrying a different ffmpeg — or, worse, appear to pass and
// be mistaken for render evidence. They run via `npm run test:media`
// (vitest.media.config.ts) and in the `worker-media-5-1` CI job.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**', 'src/__tests__/media/**'],
  },
})
