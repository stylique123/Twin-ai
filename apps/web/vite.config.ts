import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // ONE 639 kB CHUNK EVERY VISITOR DOWNLOADS BEFORE SEEING ANYTHING.
        //
        // The routes were already lazy — 37 chunks, with Result and V2Capture
        // split out. What was not split is the shared core, and on the mobile
        // networks this product is used on (a creator filming away from their
        // desk) a single blocking chunk is the whole first-paint budget spent
        // before the app can decide what to render.
        //
        // Splitting by VENDOR rather than by route, because these are the parts
        // whose cache lifetimes genuinely differ: app code changes on every
        // deploy, React does not. A returning creator re-downloads only what
        // actually moved, and the four fetch in parallel rather than in series.
        //
        // `manualChunks` is deliberately narrow. Over-splitting costs a request
        // per chunk and turns one large download into many small round trips,
        // which is WORSE on a high-latency connection — the exact condition
        // this is meant to help.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          // Order matters: react-router and react-dom both match /react/, so
          // the more specific tests come first.
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }
          // The data layer. Large, and independent of the UI framework's
          // release cadence.
          if (id.includes('@supabase')) return 'vendor-supabase'
          // Animation is used on every screen but changes rarely, and it is the
          // single biggest non-essential weight in the core.
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) {
            return 'vendor-motion'
          }
          return undefined
        },
      },
    },
  },
})
