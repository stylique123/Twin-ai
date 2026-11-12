// Home (/dashboard), built from the Home board (>=768) and MHome (<768).
// Real data only: every number and line comes from the creator's own scripts,
// posts and connections. Pieces the app has no data for are left out (see the
// Part 3a PR's backend list) rather than filled with an example.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Check, ChevronDown, Trophy, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  claimQualifier, getDashboardStats, getReferralCode, getBrandStats, listBrandVoices, listConnections, listGenerations, listPosts,
  recordPostStats, validateClaim, resolveFinishedOutputsResult,
  type BrandStats, type DashboardStats, type FinishedOutput, type OutcomeClaim, type PlatformConnection, type Post,
} from '../lib/api'
import type { BrandVoice, Generation } from '../lib/types'
import { draftTitle, estimateDurationSec } from '@twinai/shared'
import { AddYourProductCard } from '../components/AddYourProductCard'
import { OutcomeHistory } from '../components/OutcomeHistory'
import { OPEN_SHELL_MENU } from '../components/AppShell'
import { cn } from '../lib/cn'
import '../styles/onboarding.css'
import '../styles/app.css'

// Stale-while-revalidate cache (module-scoped, survives route changes) so hopping
// back to Home is INSTANT — it renders last data immediately and refetches in the
// background instead of blanking and re-hitting every endpoint on each visit.
let DASH_CACHE: { stats: DashboardStats | null; gens: Generation[]; posts: Post[]; voices: BrandVoice[] } | null = null

/** Spoken length of a script, from its own lines (the teleprompter's estimate). */
function runtimeSec(g: Generation): number {
  const lines = g.blueprint?.script ?? []
  return Math.round(lines.reduce((t, b) => t + estimateDurationSec(b.line || null), 0))
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const lengthLabel = (s: number) => (s < 60 ? `${s}-second video` : `${mmss(s)} video`)
function placesOf(g: Generation): number {
  const set = new Set((g.blueprint?.script ?? []).map((b) => (b.location ?? '').trim().toLowerCase()).filter(Boolean))
  return set.size
}
function firstLines(g: Generation): string[] {
  return (g.blueprint?.script ?? []).map((b) => (b.line ?? '').trim()).filter(Boolean).slice(0, 3)
}
function greeting(d = new Date()): string {
  const h = d.getHours()
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(() => DASH_CACHE?.stats ?? null)
  const [gens, setGens] = useState<Generation[]>(() => DASH_CACHE?.gens ?? [])
  // OUTPUT-1: an editor-v2 render must count as finished, not as a draft.
  const [finished, setFinished] = useState<Map<string, FinishedOutput>>(new Map())
  // An empty `finished` is ambiguous on its own: did the lookup run?
  const [finishedComplete, setFinishedComplete] = useState(true)
  const [posts, setPosts] = useState<Post[]>(() => DASH_CACHE?.posts ?? [])
  const [voices, setVoices] = useState<BrandVoice[]>(() => DASH_CACHE?.voices ?? [])
  const [conns, setConns] = useState<PlatformConnection[] | null>(null)
  const [selectedBrand, setSelectedBrand] = useState('') // '' = all brands
  const [brandStats, setBrandStats] = useState<BrandStats | null>(null)
  const [loading, setLoading] = useState(() => !DASH_CACHE)
  const [error, setError] = useState(false)

  const credits = profile?.credits ?? 0

  // A failed load surfaces a real retry. With cached data present we refetch
  // SILENTLY; only a cold load shows the loading state.
  const load = () => {
    if (!DASH_CACHE) setLoading(true)
    setError(false)
    Promise.all([getDashboardStats(credits), listGenerations(), listPosts(), listBrandVoices().catch(() => [])])
      .then(([s, g, p, vs]) => {
        const readyVoices = (vs as BrandVoice[]).filter((v) => v.status === 'ready')
        setStats(s); setGens(g); setPosts(p); setVoices(readyVoices)
        resolveFinishedOutputsResult(g)
          .then((r) => { setFinished(r.outputs); setFinishedComplete(r.complete) })
          .catch(() => setFinishedComplete(false))
        DASH_CACHE = { stats: s, gens: g, posts: p, voices: readyVoices }
      })
      .catch(() => { if (!DASH_CACHE) setError(true) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits])
  // Whether TikTok is connected decides the Posted line and the Connect card.
  // Fails soft to "unknown" (null), which shows neither claim.
  useEffect(() => { listConnections().then(setConns).catch(() => setConns(null)) }, [])

  // Agency view: scope the headline counts to one client brand.
  useEffect(() => {
    if (!selectedBrand) { setBrandStats(null); return }
    getBrandStats(selectedBrand).then(setBrandStats).catch(() => setBrandStats(null))
  }, [selectedBrand])

  const brand = voices.find((v) => v.is_default) ?? voices[0] ?? null
  const isAgency = profile?.plan === 'agency'
  const scoped = !!(selectedBrand && brandStats)
  // `undefined` means UNKNOWN: a failed readiness lookup makes every video look
  // unfinished, so the counts it feeds are withheld rather than shown wrong.
  const outputsKnown = scoped || (stats?.outputsComplete ?? true)
  const draftsVal = scoped ? brandStats!.drafts : (outputsKnown ? stats?.drafts : undefined)
  const readyVal = scoped ? brandStats!.ready : (outputsKnown ? stats?.ready : undefined)
  const publishedVal = scoped ? brandStats!.published : stats?.published
  const writtenVal = draftsVal !== undefined && readyVal !== undefined && publishedVal !== undefined ? draftsVal + readyVal + publishedVal : undefined
  const streak = postingStreak(posts)
  const formatInsight = useMemo(() => computeFormatInsight(posts, gens), [posts, gens])
  const topId = posts.reduce((best, p) => ((p.views ?? 0) > 0 && (p.views ?? 0) > (posts.find((x) => x.id === best)?.views ?? 0) ? p.id : best), '')

  // Greet with the ACTIVE BRAND VOICE handle first, then a set display name;
  // the email prefix only once voices have loaded, so it never flashes.
  const rawName = (brand?.handle ? `@${brand.handle}` : '')
    || (loading ? '' : (profile?.display_name?.trim() || profile?.email?.split('@')[0] || ''))
  const name = !rawName ? '' : rawName.startsWith('@') ? rawName : rawName.charAt(0).toUpperCase() + rawName.slice(1)
  const initial = (name.replace(/^@/, '')[0] ?? '').toUpperCase()

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const publishedIds = new Set(posts.filter((p) => p.status === 'posted' && p.generation_id).map((p) => p.generation_id))
  const wkWritten = gens.filter((g) => +new Date(g.created_at) > weekAgo).length
  // Ready to film = written, not finished, not posted. Only claimed when the
  // readiness lookup actually ran; otherwise nothing is listed as ready.
  const toFilm = finishedComplete ? gens.filter((g) => !finished.has(g.id) && !publishedIds.has(g.id) && (g.blueprint?.script?.length ?? 0) > 0) : []
  const next = toFilm[0] ?? null
  const also = toFilm.slice(1, 5)
  const tiktok = conns === null ? null : conns.some((c) => c.platform === 'tiktok' && c.status !== 'revoked' && c.status !== 'error')

  const sub = loading ? '' : toFilm.length > 0
    ? `${toFilm.length} ${toFilm.length === 1 ? 'script is' : 'scripts are'} ready for you. Film one today.`
    : gens.length === 0 ? 'Make your first script, and it will wait for you here.' : 'Everything you wrote is filmed. Make the next one.'

  return (
    <main className="page-glow relative min-h-[100dvh] overflow-clip leading-[normal] text-cream">
      <div className="ob-aur ob-drift1 left-[-120px] top-[-160px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(255,91,123,0.16),rgba(255,91,123,0)_65%)] [animation-duration:16s]" aria-hidden="true" />
      <div className="ob-aur ob-drift2 right-[-140px] top-[240px] hidden h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle,rgba(101,229,216,0.10),rgba(101,229,216,0)_65%)] [animation-duration:20s] md:block" aria-hidden="true" />

      {/* <768: MHome. */}
      <div className="relative flex flex-col md:hidden">
        <header className="pin d1 flex items-center justify-between px-5 pt-[max(12px,env(safe-area-inset-top))]">
          <h1 className="m-0 text-[26px] font-bold tracking-[-0.03em]">{greeting()}{name && <>, <span className="ob-grad">{name}</span></>}</h1>
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SHELL_MENU))} aria-label="Open menu"
            className="-my-1 -mr-1 flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFB347,#FF5B7B)] text-[14px] font-extrabold text-ink">{initial}</span>
          </button>
        </header>
        {error && !loading && <LoadError onRetry={load} className="mx-5 mt-5" />}
        <div className="mx-5 mt-4 empty:hidden"><AddYourProductCard voiceId={brand?.id ?? null} /></div>
        {loading ? <Spinner /> : next ? (
          <div className="pin d2 relative mx-5 mt-5 overflow-hidden rounded-[20px] p-[1.5px]">
            <Spinner6 size={900} />
            <section aria-label="Film this next" className="relative flex flex-col gap-3 rounded-[18.5px] bg-[#131318] p-[18px]">
              <span className="text-[12px] font-bold tracking-[.08em] text-amber">FILM THIS NEXT</span>
              <p className="m-0 text-[20px] font-semibold leading-[1.28] tracking-[-0.015em]">{draftTitle(next.blueprint)}</p>
              <span className="text-[13px] text-[#9C9384]">{runtimeSec(next)} seconds</span>
              <div className="mt-[2px] flex items-center gap-3">
                <Link to={`/record/${next.id}`} className="ob-cta ob-gbtn inline-flex min-h-11 items-center gap-2 rounded-[12px] px-[18px] py-[11px] text-[14.5px] font-bold text-ink no-underline">
                  <span className="app-recdot h-2 w-2 rounded-full bg-ink" />Record
                </Link>
                <Link to={`/result/${next.id}`} className="flex min-h-11 items-center text-[14px] font-semibold text-sand no-underline">Open script</Link>
              </div>
            </section>
          </div>
        ) : <FirstScript className="mx-5 mt-5" />}
        {also.length > 0 && (
          <section className="pin d3 mx-5 mt-7 flex flex-col">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="m-0 text-[16px] font-bold">Ready to film</h2>
              <Link to="/history" className="text-[13px] text-[#9C9384] no-underline">All {toFilm.length}</Link>
            </div>
            {also.slice(0, 3).map((g) => (
              <Link key={g.id} to={`/result/${g.id}`} className="app-row flex items-center gap-3 border-b border-white/[0.06] px-[2px] py-[14px] text-cream no-underline">
                <span className="flex-grow text-[15px] leading-[1.35]">{draftTitle(g.blueprint)}</span>
                <span className="text-[12.5px] text-label">{mmss(runtimeSec(g))}</span>
              </Link>
            ))}
          </section>
        )}
        {tiktok === false && (
          <Link to="/calendar" className="pin d4 mx-5 mt-6 flex items-center justify-between rounded-[12px] border border-[rgba(101,229,216,0.18)] bg-[rgba(101,229,216,0.07)] px-[14px] py-3 text-[13.5px] no-underline">
            <span className="text-sand">Connect TikTok to auto-post</span><span className="font-bold text-teal-soft">Connect</span>
          </Link>
        )}
        <div className="flex flex-col gap-5 px-5 pb-7 pt-7">
          <Extras isAgency={isAgency} voices={voices} selectedBrand={selectedBrand} setSelectedBrand={setSelectedBrand}
            formatInsight={formatInsight} posts={posts} topId={topId} streak={streak} />
          <InviteCard />
        </div>
      </div>

      {/* >=768: the Home board. 768-1023 keeps the structure, one column fewer. */}
      <div className="relative mx-auto hidden w-full max-w-[1192px] flex-col gap-7 px-8 py-12 md:flex lg:px-10 xl:px-16">
        <div className="pin d1 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[36px] font-bold tracking-[-0.03em]">{greeting()}{name && <>, <span className="ob-grad">{name}</span></>}</h1>
            <p className="m-0 text-[15px] text-sand-muted">{sub}</p>
          </div>
          <Link to="/app" className="ob-lift shrink-0 rounded-[10px] bg-cream px-[18px] py-[11px] text-[14px] font-semibold text-ink no-underline">New script</Link>
        </div>
        {error && !loading && <LoadError onRetry={load} />}
        <AddYourProductCard voiceId={brand?.id ?? null} />
        {isAgency && voices.length > 1 && <BrandFilter voices={voices} selectedBrand={selectedBrand} setSelectedBrand={setSelectedBrand} />}

        <section aria-label="Your pipeline" className="pin d2 grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#111115] lg:grid-cols-4">
          <div className="flex flex-col gap-[6px] border-b border-r border-white/[0.06] px-[22px] py-5 lg:border-b-0">
            <span className="text-[13px] text-sand-muted">Written</span>
            <span className="text-[30px] font-bold tracking-[-0.02em]">{writtenVal ?? '…'}</span>
            <span className="app-grow block h-1 rounded-[9px] bg-[linear-gradient(90deg,#FFB347,#FF5B7B)]" />
            {wkWritten > 0 && <span className="text-[12.5px] text-label">+{wkWritten} this week</span>}
          </div>
          <div className="flex flex-col gap-[6px] border-b border-white/[0.06] bg-[rgba(255,91,123,0.05)] px-[22px] py-5 lg:border-b-0 lg:border-r">
            <span className="flex items-center gap-2 text-[13px] text-coral-soft">
              <span className="ob-ringp h-2 w-2 rounded-full bg-coral" />Filmed
              <span className="ml-auto whitespace-nowrap rounded-full bg-[rgba(255,91,123,0.15)] px-2 py-[2px] text-[12px] font-bold">START HERE</span>
            </span>
            {next
              ? <Link to={`/record/${next.id}`} className="text-[13px] font-semibold text-coral-soft no-underline">Record the next one →</Link>
              : <span className="text-[12.5px] text-sand-muted">Most people get stuck here</span>}
          </div>
          <div className="flex flex-col gap-[6px] border-r border-white/[0.06] px-[22px] py-5">
            <span className="text-[13px] text-sand-muted">Edited</span>
            <span className={cn('text-[30px] font-semibold tracking-[-0.02em]', !readyVal && 'text-label')}>{readyVal ?? '…'}</span>
            <span className="text-[12.5px] text-label">Automatic after filming</span>
          </div>
          <div className="flex flex-col gap-[6px] px-[22px] py-5">
            <span className="text-[13px] text-sand-muted">Posted</span>
            <span className={cn('text-[30px] font-semibold tracking-[-0.02em]', !publishedVal && 'text-label')}>{publishedVal ?? '…'}</span>
            {tiktok !== null && <span className="text-[12.5px] text-label">{tiktok ? 'TikTok connected' : 'TikTok not connected'}</span>}
          </div>
        </section>

        {loading ? <Spinner /> : next ? (
          <div className="pin d3 relative overflow-hidden rounded-[18px] p-[1.5px]">
            <Spinner6 size={1600} />
            <section aria-label="Up next" className="relative flex flex-col overflow-hidden rounded-[16.5px] bg-[#131318] lg:flex-row">
              <div className="flex flex-grow basis-0 flex-col gap-[18px] px-8 py-[30px]">
                <span className="app-bob inline-flex items-center gap-2 self-start rounded-full bg-[rgba(255,179,71,0.12)] px-3 py-[5px] text-[13px] font-bold text-amber">Film this one next</span>
                <p className="m-0 text-[28px] font-semibold leading-[1.25] tracking-[-0.02em]">“{draftTitle(next.blueprint)}”</p>
                <div className="flex flex-wrap gap-2">
                  {[lengthLabel(runtimeSec(next)), `${next.blueprint.script.length} scenes`, ...(placesOf(next) > 0 ? [`${placesOf(next)} ${placesOf(next) === 1 ? 'place' : 'places'}`] : [])].map((c) => (
                    <span key={c} className="rounded-full bg-white/[0.05] px-[11px] py-[5px] text-[13px] text-sand-muted">{c}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-[10px] pt-1">
                  <Link to={`/record/${next.id}`} className="ob-cta ob-gbtn inline-flex items-center gap-[10px] rounded-[12px] px-[22px] py-[13px] text-[14.5px] font-bold text-ink no-underline">
                    <span className="app-recdot h-[9px] w-[9px] rounded-full bg-white" />Start recording
                  </Link>
                  <Link to={`/result/${next.id}`} className="rounded-[10px] border border-white/[0.12] px-[18px] py-3 text-[14px] font-semibold text-cream no-underline">Open the script</Link>
                </div>
              </div>
              {firstLines(next).length > 0 && (
                <div className="flex shrink-0 flex-col justify-center gap-[14px] border-t border-white/[0.06] bg-[#0E0E12] p-7 lg:w-[300px] lg:border-l lg:border-t-0 xl:w-[360px]">
                  <span className="text-[12px] text-label">First lines</span>
                  {firstLines(next).map((l, i) => (
                    <p key={i} className={cn('pin m-0', i === 0 ? 'd5 border-l-[3px] border-coral pl-3 text-[17px] font-semibold leading-[1.45]' : i === 1 ? 'd6 pl-[15px] text-[15px] leading-[1.5] text-label' : 'd7 pl-[15px] text-[15px] leading-[1.5] text-[#57524A]')}>“{l}”</p>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : <FirstScript />}

        <div className="pin d4 flex flex-col items-start gap-5 xl:flex-row">
          <section aria-label="Ready to film" className="flex w-full flex-grow basis-0 flex-col gap-3">
            {also.length > 0 && (
              <>
                <div className="flex items-baseline justify-between">
                  <h2 className="m-0 text-[17px] font-semibold">Also ready to film</h2>
                  <Link to="/history" className="text-[13.5px] text-sand-muted">See all {toFilm.length}</Link>
                </div>
                <div className="flex flex-col rounded-[14px] border border-white/[0.07] bg-[#111115]">
                  {also.map((g, i) => (
                    <div key={g.id} className={cn('app-row flex items-center gap-4 px-[18px] py-[15px]', i < also.length - 1 && 'border-b border-white/[0.05]')}>
                      <Link to={`/result/${g.id}`} className="flex-grow text-[14.5px] text-cream no-underline">{draftTitle(g.blueprint)}</Link>
                      <span className="text-[13px] text-label">{mmss(runtimeSec(g))}</span>
                      <Link to={`/record/${g.id}`} className="inline-flex items-center gap-[6px] text-[13px] font-semibold text-coral-soft no-underline">
                        <span className="h-[7px] w-[7px] rounded-full bg-coral" />Record
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            )}
            <Extras isAgency={false} voices={voices} selectedBrand={selectedBrand} setSelectedBrand={setSelectedBrand}
              formatInsight={formatInsight} posts={posts} topId={topId} streak={streak} />
          </section>
          <aside className="grid w-full shrink-0 gap-[14px] md:grid-cols-2 xl:flex xl:w-[340px] xl:flex-col">
            {tiktok === false && (
              <div className="ob-lift flex flex-col gap-[10px] rounded-[14px] border border-white/[0.07] bg-[#111115] p-5">
                <span className="flex items-center gap-[10px] text-[15px] font-semibold">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[rgba(101,229,216,0.14)] text-teal">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  </span>Connect TikTok
                </span>
                <span className="text-[13.5px] leading-[1.55] text-sand-muted">So finished videos go out on their own at the time you pick.</span>
                <Link to="/calendar" className="self-start rounded-[9px] border border-white/[0.12] px-[14px] py-2 text-[13px] font-semibold text-cream no-underline">Connect</Link>
              </div>
            )}
            <InviteCard />
          </aside>
        </div>
      </div>
    </main>
  )
}

function Spinner() {
  return <div className="flex items-center justify-center py-14 text-stone"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
}
function Spinner6({ size }: { size: number }) {
  return (
    <div aria-hidden="true" className="app-spin6 absolute left-1/2 top-1/2 bg-[conic-gradient(from_0deg,rgba(255,179,71,0),rgba(255,179,71,0.9),rgba(255,91,123,0.9),rgba(101,229,216,0.8),rgba(255,179,71,0)_40%)]"
      style={{ width: size, height: size, margin: `-${size / 2}px 0 0 -${size / 2}px` }} />
  )
}
function LoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-[14px] border border-coral/30 bg-coral/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <p className="m-0 text-[14px] text-cream">We couldn't load your home screen just now. Usually a brief connection hiccup.</p>
      <button type="button" onClick={onRetry} className="btn-board-light shrink-0 self-start !px-4 !py-2 !text-[13px] sm:self-auto">Try again</button>
    </div>
  )
}
/** No scripts yet: the Up next frame, pointing at Create. */
function FirstScript({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-[18px] border border-white/[0.07] bg-[#131318] p-[18px] md:px-8 md:py-[30px]', className)}>
      <span className="text-[12px] font-bold tracking-[.08em] text-amber">NOTHING TO FILM YET</span>
      <p className="m-0 text-[20px] font-semibold leading-[1.28] md:text-[28px]">Make your first script.</p>
      <Link to="/app" className="ob-cta ob-gbtn inline-flex min-h-11 items-center rounded-[12px] px-[18px] py-[11px] text-[14.5px] font-bold text-ink no-underline">New script</Link>
    </div>
  )
}
function BrandFilter({ voices, selectedBrand, setSelectedBrand }: { voices: BrandVoice[]; selectedBrand: string; setSelectedBrand: (v: string) => void }) {
  const chip = (on: boolean) => cn('min-h-11 rounded-full border px-[14px] py-[7px] text-[13px] md:min-h-0', on ? 'border-[rgba(255,91,123,0.6)] bg-[rgba(255,91,123,0.12)] text-cream' : 'border-white/10 bg-transparent text-sand-muted')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-label">View:</span>
      <button type="button" onClick={() => setSelectedBrand('')} className={chip(!selectedBrand)}>All brands</button>
      {voices.map((v) => <button key={v.id} type="button" onClick={() => setSelectedBrand(v.id)} className={chip(selectedBrand === v.id)}>@{v.handle}</button>)}
    </div>
  )
}

/** What Home did before the boards and the boards do not show: the agency
 *  filter (phone), the format insight and the publishing log, where views are
 *  entered. Kept, in board styling. */
function Extras({ isAgency, voices, selectedBrand, setSelectedBrand, formatInsight, posts, topId, streak }: {
  isAgency: boolean; voices: BrandVoice[]; selectedBrand: string; setSelectedBrand: (v: string) => void
  formatInsight: FormatInsight | null; posts: Post[]; topId: string; streak: number
}) {
  return (
    <>
      {isAgency && voices.length > 1 && <BrandFilter voices={voices} selectedBrand={selectedBrand} setSelectedBrand={setSelectedBrand} />}
      {formatInsight && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-[rgba(101,229,216,0.2)] bg-[rgba(101,229,216,0.05)] p-5">
          <span className="text-[12px] font-bold tracking-[.12em] text-teal">WHAT'S WORKING FOR YOU</span>
          <p className="m-0 text-[14.5px] leading-[1.5] text-cream">
            Your <b>{formatInsight.format}</b> videos average <b>{formatInsight.avg.toLocaleString()}</b> views, <b className="text-teal">{formatInsight.multiple}×</b> your other formats.
          </p>
          {/* The qualification comes from the contract, so the same claim reads
              the same wherever it is shown, with its N. */}
          <p className="m-0 text-[12.5px] text-label">{claimQualifier(formatInsight.claim)}</p>
          <Link to="/gallery" className="self-start text-[13px] font-semibold text-teal-soft no-underline">Make another →</Link>
        </div>
      )}
      {posts.length > 0 && (
        <section aria-label="Posted" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[17px] font-semibold">Posted</h2>
            {streak > 0 && <span className="text-[13px] text-amber">{streak}-day streak</span>}
          </div>
          <div className="flex flex-col gap-2">
            {posts.slice(0, 6).map((p, i) => <PostRow key={p.id} p={p} isTop={p.id === topId} seq={i + 1} />)}
          </div>
        </section>
      )}
    </>
  )
}

// Viral loop: the two-sided referral, as the Home board's invite card. "2"
// mirrors REFERRAL_REWARD_CREDITS (20 credits = 2 videos) on the edge fn.
function InviteCard() {
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { getReferralCode().then(setCode).catch(() => {}) }, [])
  const link = code ? `${window.location.origin}/auth?mode=signup&ref=${code}` : ''
  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ }
  }
  return (
    <div id="invite" className="ob-lift flex flex-col gap-[10px] rounded-[14px] border border-white/[0.07] bg-[#111115] p-5">
      <span className="flex items-center gap-[10px] text-[15px] font-semibold">
        <span className="app-bob flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[rgba(255,179,71,0.14)] text-amber">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4 9 8 12 8zM12 8s2-5 4.5-4S15 8 12 8z" /></svg>
        </span>Get 2 more free videos
      </span>
      <span className="text-[13.5px] leading-[1.55] text-sand-muted">Invite a creator. You both get 2 when they join.</span>
      <div className="flex gap-2">
        <span className="flex-grow rounded-[9px] border border-white/[0.08] bg-ink px-3 py-2 text-[13.5px] tracking-[0.08em]">{code ?? '········'}</span>
        <button type="button" onClick={copy} disabled={!code} className="btn-board-light !rounded-[9px] !px-[14px] !py-2 !text-[13px] !font-semibold disabled:opacity-50">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

// A logged post with self-reported performance. The creator enters how it did
// (views) until real platform numbers are pulled in via OAuth later; the top
// performer is badged so they can see which format actually won.
//
// EVERY SAVE IS APPENDED, not just written. This input has been collecting the
// only performance data the product has, and each save overwrote the last one —
// so "views at 24h" and "views at 30d", which is most of the signal, were being
// destroyed by the UI that gathered them. `recordPostStats` keeps the column as
// the cache the dashboard sorts on and adds the reading to §7b's log; the
// history below is that log, read back.
function PostRow({ p, isTop, seq }: { p: Post; isTop: boolean; seq: number }) {
  const [views, setViews] = useState(p.views != null ? String(p.views) : '')
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)
  // Bumped on each save so the history re-reads and the creator sees the
  // reading they just entered take its place in the series.
  const [rev, setRev] = useState(0)
  const save = async () => {
    const n = parseInt(views.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(n)) return
    await recordPostStats(p.id, n)
    setRev((r) => r + 1)
    setSaved(true); setTimeout(() => setSaved(false), 1200)
  }
  return (
    <div className={cn('rounded-xl border bg-white/[0.025] transition-colors', isTop ? 'border-amber/40' : 'border-white/[0.06] hover:border-white/[0.12]')}>
      <div className="flex items-center gap-3 p-3">
        <span className="w-14 shrink-0 font-heading text-xs capitalize text-teal">{p.platform}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-cream">{isTop && <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber" />}{p.caption || 'Posted'}</span>
        <div className="flex shrink-0 items-center gap-1">
          <Eye className="h-3 w-3 text-stone" />
          <input
            value={views}
            onChange={(e) => setViews(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            inputMode="numeric"
            placeholder="views"
            aria-label={`Views for post ${seq}`}
            className="w-16 border-b border-white/10 bg-transparent text-right text-xs text-cream outline-none transition-colors placeholder:text-stone/50 focus:border-teal"
          />
          {saved && <Check className="h-3 w-3 text-teal" />}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? 'Hide reading history' : 'Show reading history'}
            className="ml-1 rounded p-0.5 text-stone transition-colors hover:text-cream"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </div>
      {open && <OutcomeHistory key={rev} postId={p.id} />}
    </div>
  )
}

// Consecutive-day posting streak from logged posts (anchored to today or
// yesterday so a not-yet-posted-today streak still counts).
// Tie outcomes to choices: group the creator's self-reported post views by the
// FORMAT each post was built from (generation.blueprint.reference_read.format_label),
// and return the format that's outperforming — the "lean into X" learning signal.
// Returns null until there's real signal (≥2 formats, the winner has ≥2 posts, and
// it's meaningfully ahead) so it never shows noise.
//
// IT IS A CORRELATION, AND IT NOW SAYS SO. §7b's absolute rule is "never
// conclude 'this hook caused performance' from one successful video", and this
// panel shipped as a causal instruction — "Make more like it" — with the sample
// size computed and then dropped at render. A creator reading it had no way to
// tell three videos from thirty.
//
// So the claim is built through `validateClaim` rather than described as one:
// the n≥2 floor becomes a refusal instead of a convention, and
// `claimQualifier` supplies the wording, so this panel cannot drift from the
// gallery or an export that shows the same claim.
interface FormatInsight { format: string; avg: number; multiple: number; n: number; claim: OutcomeClaim }
function computeFormatInsight(posts: Post[], gens: Generation[]): FormatInsight | null {
  const fmtOf = new Map<string, string>()
  for (const g of gens) {
    const f = g.blueprint?.reference_read?.format_label?.trim()
    if (f) fmtOf.set(g.id, f)
  }
  const byFmt = new Map<string, number[]>()
  for (const p of posts) {
    const v = Number(p.views ?? 0)
    if (!(v > 0) || !p.generation_id) continue
    const f = fmtOf.get(p.generation_id)
    if (!f) continue
    if (!byFmt.has(f)) byFmt.set(f, [])
    byFmt.get(f)!.push(v)
  }
  const stats = [...byFmt.entries()].map(([f, vs]) => ({ f, n: vs.length, avg: vs.reduce((a, b) => a + b, 0) / vs.length }))
  if (stats.length < 2) return null
  stats.sort((a, b) => b.avg - a.avg)
  const top = stats[0]
  if (top.n < 2) return null
  const restAvg = stats.slice(1).reduce((a, s) => a + s.avg, 0) / (stats.length - 1)
  const multiple = restAvg > 0 ? top.avg / restAvg : 0
  if (multiple < 1.2) return null
  const rounded = Math.round(multiple * 10) / 10
  const claim = validateClaim({
    type: 'correlation',
    statement: `${top.f} videos average ${rounded}× the views of your other formats`,
    sampleSize: top.n,
  })
  // n=1 is refused by the contract, not by the `top.n < 2` check above alone.
  // If that check is ever loosened, this returns null rather than rendering a
  // correlation drawn from one video.
  if ('rejected' in claim) return null
  return { format: top.f, avg: Math.round(top.avg), multiple: rounded, n: top.n, claim }
}

function postingStreak(posts: Post[]): number {
  const days = new Set(posts.map((p) => new Date(p.posted_at ?? p.created_at).toDateString()))
  const d = new Date()
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  let streak = 0
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }
  return streak
}
