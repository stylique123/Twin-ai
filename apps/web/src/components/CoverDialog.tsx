// THE COVER, BEHIND A BUTTON — Phase 12a, "after the render".
//
// The cover used to sit permanently on the plan screen as a full 9:16 card,
// beside the video. It is a thing a creator wants exactly twice — once to look
// at, once to download on the way to posting — and it occupied a screen they
// read while filming.
//
// ── GENERATE ONCE, AND THAT IS NOW A SERVER GUARANTEE ────────────────────
//
// Opening this never re-renders the cover, and that holds even if this file is
// wrong. `generate-thumbnail` short-circuits on a stored `ai_thumb_path`: it
// re-signs the existing object, does not call the paid image model, and does
// not write a new one.
//
// The guarantee previously lived ONLY in a client conditional deciding whether
// to show the button, which a second tab, a stale cache or a direct invoke each
// defeated — and every miss both burned a paid call and wrote a new
// `Date.now()`-suffixed object, so the creator's cover changed under them. It is
// now enforced where it cannot be routed around, and the client's own read path
// below means the ordinary case never reaches it.
//
// ── VIEWING NEVER INVOKES THE GENERATOR ──────────────────────────────────
//
// An existing cover is signed CLIENT-SIDE with `signEditUrls`. The `edits` read
// policy lets an owner sign objects whose first path folder is their workspace
// id, and covers are stored at `${user.id}/ai-thumb/…` precisely so that works.
//
// That is not just faster. The edge function auto-deploys on merge while the
// web app deploys from the same push, so there is a window where a new client
// meets an old function — and in that window an "open the cover" call would
// have regenerated it: a paid image call, and the creator's cover silently
// replaced. Viewing a cover is a read, so it goes down a read path, and the
// function is invoked only to MAKE the first one.
//
// A signed URL also expires. The PATH is what the creator owns, so re-opening
// re-signs rather than reusing a URL from an earlier visit — otherwise the
// cover would appear to vanish a day after it was made.
import { useEffect, useState } from 'react'
import { Download, Image as ImageIcon, Loader2, X } from 'lucide-react'
import { generateThumbnail, signEditUrls } from '../lib/api'

interface Props {
  generationId: string
  /** The stored object path, when there is one. Signed directly for viewing. */
  coverPath?: string | null
  /** Whether a cover already exists. Decides the button's word — "Cover" and
   *  "Make a cover" are different promises and must not be the same button. */
  hasCover: boolean
  /** A signed URL already in hand, if the page has one. Only ever a head start
   *  so the image is not blank for a moment: the dialog re-signs from the path
   *  on open, because this one may have expired. */
  initialUrl?: string | null
  onCreated?: (path: string) => void
}

export function CoverButton({ generationId, hasCover, coverPath, initialUrl, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream transition hover:bg-white/10"
      >
        <ImageIcon className="h-3.5 w-3.5" /> {hasCover ? 'Cover' : 'Make a cover'}
      </button>
      {open && (
        <CoverDialog
          generationId={generationId}
          hasCover={hasCover}
          coverPath={coverPath}
          initialUrl={initialUrl}
          onCreated={onCreated}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function CoverDialog({ generationId, hasCover, coverPath, initialUrl, onCreated, onClose }: Props & { onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // An existing cover is SIGNED, not regenerated — a read down a read path. A
  // cover that does not exist yet waits for the creator to ask, because making
  // one costs a paid image call and opening a dialog is not asking.
  useEffect(() => {
    if (!hasCover || !coverPath) return
    let alive = true
    setBusy(true)
    signEditUrls([coverPath])
      .then((m) => {
        if (!alive) return
        const signed = m[coverPath]
        if (signed) setUrl(signed)
        else setError('Could not load your cover. Reload and try again.')
      })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [coverPath, hasCover])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const make = async () => {
    setBusy(true); setError(null)
    try {
      const r = await generateThumbnail(generationId)
      setUrl(r.url)
      // Reported either way. `reused: true` means another tab already made it
      // and the server handed that one back — the page still needs to learn the
      // path, or its button keeps saying "Make a cover" for a cover that exists.
      onCreated?.(r.path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make your cover.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Video cover"
    >
      <div
        className="w-full max-w-sm rounded-card border border-white/10 bg-ink2 p-4 shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-cream">Cover image</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-stone transition-colors hover:text-cream"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black">
          {url ? (
            <img src={url} alt="Video cover" className="h-full w-full object-cover" />
          ) : busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          ) : (
            <p className="px-6 text-center text-xs text-stone">
              A ready-to-post cover image for this video.
            </p>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-coral">{error}</p>}

        <div className="mt-3">
          {url ? (
            <a
              href={url + (url.includes('?') ? '&' : '?') + 'download=twinai-cover.png'}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/10 py-2.5 text-sm font-semibold text-cream transition hover:bg-white/20"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          ) : (
            // No Regenerate, ever. Once a cover exists it is the creator's
            // cover, and the server will not make a second one.
            <button
              type="button"
              onClick={make}
              disabled={busy}
              className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 text-sm font-semibold text-cream transition hover:bg-white/20 disabled:opacity-60"
            >
              {busy ? 'Making your cover…' : 'Make my cover'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
