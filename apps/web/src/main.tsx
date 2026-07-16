import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// Stale-chunk recovery. Every deploy fingerprints new JS chunk names, so a tab
// left open across a deploy fails to lazy-load a route ("it just gets stuck /
// won't load, and I have to reload"). When a dynamic import fails, reload ONCE to
// pull the fresh index + chunks. The sessionStorage guard prevents a reload loop
// if the failure is something other than a stale chunk (real network outage).
function recoverFromStaleChunk() {
  const KEY = 'twinai_chunk_reloaded'
  try {
    if (sessionStorage.getItem(KEY)) return // already tried once this session
    sessionStorage.setItem(KEY, '1')
    window.location.reload()
  } catch {
    window.location.reload()
  }
}
// Clear the guard on a clean load so a LATER stale-chunk (next deploy) can recover too.
window.addEventListener('load', () => { try { sessionStorage.removeItem('twinai_chunk_reloaded') } catch { /* ignore */ } })
// Vite's dedicated event for a failed dynamic import (preload).
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recoverFromStaleChunk() })
// Backstop: a bare ChunkLoadError / failed dynamic import that slips past the above.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e.reason && (e.reason.message || e.reason)) || '')
  if (/ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)) {
    recoverFromStaleChunk()
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
