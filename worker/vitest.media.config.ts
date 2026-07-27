import { defineConfig } from 'vitest/config'

// The REAL-MEDIA harness. Separate from the default suite on purpose:
//
//  * it executes ffmpeg for real, so it is slow (whole renders, full decodes,
//    ebur128 passes) and needs generous timeouts;
//  * it FAILS CLOSED off the pinned ffmpeg 5.1 major — that refusal is the point,
//    not an inconvenience, so it must never be folded into `npm test`;
//  * renders and probes are CPU-bound ffmpeg processes. Running files/cases
//    concurrently would make wall-clock worse and, more importantly, would let
//    one case's transient temp files collide with another's. One worker, one
//    render at a time, fully deterministic.
export default defineConfig({
  test: {
    include: ['src/__tests__/media/**/*.media.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    fileParallelism: false,
    sequence: { concurrent: false },
    // A single render (encode 1080x1920 h264 + ASS burn-in) plus a full decode and
    // an ebur128 pass is comfortably over vitest's 5s default.
    testTimeout: 900_000,
    hookTimeout: 300_000,
    // Real work, not a hung ffmpeg: report anything that runs unusually long.
    slowTestThreshold: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
