import { Play, Heart, Eye } from 'lucide-react'
import { cn } from '../lib/cn'

export interface Reel {
  poster: string // tailwind gradient/tint classes for the poster
  accent: string // accent text color class for the caption word
  capLead: string
  capAccent: string
  views: string
  likes: string
  platform: 'TikTok' | 'Reels' | 'Shorts'
}

// A short-form video card: dark poster, glass play button, the brand's signature
// "bold chunked caption" with one accent word, and light metrics. Relatable +
// on-brand (captions are both a product feature and a brand texture, per book).
export function ReelCard({ reel, className }: { reel: Reel; className?: string }) {
  return (
    <div className={cn('relative aspect-[9/16] overflow-hidden rounded-card border border-white/10', className)}>
      {/* poster */}
      <div className={cn('absolute inset-0', reel.poster)} />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent" />

      {/* platform tag */}
      <span className="absolute left-2.5 top-2.5 rounded-md bg-ink/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream backdrop-blur">
        {reel.platform}
      </span>

      {/* play */}
      <div className="absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-white/30 bg-white/10 backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
          <Play className="h-5 w-5 translate-x-0.5 fill-cream text-cream" />
        </span>
      </div>

      {/* chunked caption */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="font-display text-sm leading-tight text-cream drop-shadow">
          {reel.capLead} <span className={reel.accent}>{reel.capAccent}</span>
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-sand">
          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {reel.views}</span>
          <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {reel.likes}</span>
        </div>
      </div>
    </div>
  )
}
