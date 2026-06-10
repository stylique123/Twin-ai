import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listGenerations } from '../lib/api'
import type { Generation } from '../lib/types'

export default function History() {
  const [items, setItems] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listGenerations()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow">History</p>
      <h1 className="mt-3 font-display text-3xl">Your blueprints</h1>

      {loading ? (
        <p className="mt-8 text-sand">Loading…</p>
      ) : items.length === 0 ? (
        <div className="glass mt-8 p-8 text-center">
          <p className="text-sand">No blueprints yet.</p>
          <Link to="/app" className="btn-primary mt-4 inline-block">
            Make your first one
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {items.map((g) => (
            <Link key={g.id} to={`/result/${g.id}`} className="glass block p-4 hover:ring-1 hover:ring-coral/40">
              <div className="flex items-center justify-between">
                <span className="font-heading text-cream">
                  {g.blueprint?.reference_read?.format_label ?? 'Blueprint'}
                </span>
                <span className="text-xs text-stone">
                  {new Date(g.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-1 truncate text-sm text-stone">{g.reference_url}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
