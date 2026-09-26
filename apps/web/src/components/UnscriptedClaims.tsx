// CHECK BEFORE POSTING — things she SAID on camera that were not in the
// approved script and sound like a claim (a price, a number, "the best", "I use
// this"). Master fix doc, Fix B: the script was checked; this checks the take.
//
// ⚖️ A FLAG, NEVER A BLOCK. Paraphrase is normal. She can strike the sentence
// in the transcript below, or leave it if it is true.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Claim { text: string; kinds: string[]; startMs: number | null }

const KIND_LABEL: Record<string, string> = {
  price: 'a price or offer',
  number: 'a number',
  superlative: 'a "best / proven / guaranteed" claim',
  personal_use: 'a claim that you use it',
}

const at = (ms: number | null) => (ms == null ? '' : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} · `)

export function UnscriptedClaims({ projectId }: { projectId: string }) {
  const [claims, setClaims] = useState<Claim[]>([])
  useEffect(() => {
    let alive = true
    void (async () => {
      const { data: p } = await supabase.from('edit_projects').select('source_asset_id').eq('id', projectId).maybeSingle()
      const asset = (p as { source_asset_id?: string } | null)?.source_asset_id
      if (!asset) return
      const { data } = await supabase.from('media_analyses').select('result')
        .eq('source_asset_id', asset).eq('component', 'alignment')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const list = (data as { result?: { unscriptedClaims?: unknown } } | null)?.result?.unscriptedClaims
      if (alive && Array.isArray(list)) setClaims(list as Claim[])
    })().catch(() => {})
    return () => { alive = false }
  }, [projectId])

  if (claims.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-4" data-testid="unscripted-claims">
      <p className="text-sm font-semibold text-cream">Check before posting</p>
      <p className="mt-1 text-xs text-sand">
        You said {claims.length === 1 ? 'something' : 'a few things'} on camera that {claims.length === 1 ? "wasn't" : "weren't"} in your script
        and {claims.length === 1 ? 'sounds' : 'sound'} like a claim. If it isn't true, strike that sentence below.
      </p>
      <ul className="mt-2 space-y-1.5">
        {claims.map((c, i) => (
          <li key={i} className="text-xs text-cream">
            <span className="text-stone">{at(c.startMs)}{c.kinds.map((k) => KIND_LABEL[k] ?? k).join(', ')}: </span>
            “{c.text}”
          </li>
        ))}
      </ul>
    </div>
  )
}
