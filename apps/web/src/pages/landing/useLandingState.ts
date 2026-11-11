// State for the Landing page, ported by hand from the Landing and MLanding
// boards' logic (renderVals). Same timings, same copy, same derived values; the
// generated LandingDesktop/LandingPhone components read them as `v`.
// Reduced motion: no timers, every animated value shows its finished state.
import { useEffect, useMemo, useRef, useState } from 'react'

const STATIC = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useTicker(ms: number, mod: number, step = 1, enabled = true) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (STATIC || !enabled) return
    const t = setInterval(() => setN((x) => (x + step) % mod), ms)
    return () => clearInterval(t)
  }, [ms, mod, step, enabled])
  return [n, setN] as const
}

/** A ticker that pauses for `holdMs` after the user picks something. */
function useHeldTicker(ms: number, mod: number, holdMs: number) {
  const [n, setN] = useState(0)
  const hold = useRef(0)
  useEffect(() => {
    if (STATIC) return
    const t = setInterval(() => { if (Date.now() < hold.current) return; setN((x) => (x + 1) % mod) }, ms)
    return () => clearInterval(t)
  }, [ms, mod])
  const pick = (i: number) => { hold.current = Date.now() + holdMs; setN(i) }
  return [n, pick] as const
}

const pos = (i: number, cur: number) => {
  const d = (i - cur + 5) % 5
  if (d === 0) return { op: 1, tf: 'none', ev: 'auto', z: 3 }
  if (d === 4) return { op: 0, tf: 'perspective(1400px) rotateY(14deg) translateX(-90px) scale(.92)', ev: 'none', z: 1 }
  return { op: 0, tf: 'perspective(1400px) rotateY(-14deg) translateX(90px) scale(.92)', ev: 'none', z: 1 }
}

const LOOP = [['Learns you', 'From your own videos: your words, your openings, what your viewers love.', '#FFB347'], ['Writes', 'Your next script, in your voice, with the opening tested first.', '#FF5B7B'], ['You record', 'Read it off a teleprompter, one scene at a time. Your face, your take.', '#F6F1E9'], ['Edits', 'Stumbles cut, captions and zooms added. Never a word you didn’t say.', '#65E5D8'], ['Posts', 'Scheduled to every account at your best time.', '#8FEDE3']]
const TOUR = [['Twin reads your videos', 'Paste your handle once. Twin studies your last posts: the words you repeat, how you open, how you end. Nothing is final until you confirm it.', 'Your voice, confirmed by you'], ['Pick how you start', 'An idea, a video you liked, something you sell, or a trend in your niche. Twin writes the script and tests four openings on viewers like yours.', 'Tested before you film'], ['Read it, don’t memorise it', 'The teleprompter shows one scene at a time, with where to stand and what to do with your hands. Every scene saves the moment you stop.', 'About 15–20 minutes'], ['Twin edits your real take', 'It cuts pauses and restarts, adds captions and zooms. You can check every cut first. It can’t add words you didn’t say.', 'About 10–12 minutes'], ['Post everywhere, then learn', 'Schedule once to every account. Comments under your video become ideas for the next one, and Twin gets more like you.', 'One loop']]
const SEG: [string, string][] = [['Honestly? I started with a ', ''], ['$40 popcorn popper', '#65E5D8'], [' on my stove. No trailer, no permits. Just ', ''], ['ten neighbours', '#FFB347'], [' who wanted good coffee. ', ''], ['Come find the cart this Saturday.', '#FF5B7B']]
const W = [
  ['Coaches & consultants', 'Turn what you explain on every call into videos that book the next one.', 'The question every new client asks me in week one.', ['Why your first 90 days feel slower than they should', 'The one question I ask on every discovery call', 'What I’d tell myself before my first client'], '#FFB347', '3 videos a week, without writing on Sunday night'],
  ['Local businesses', 'Show the real shop, the real owner and the real price. That’s what brings people in.', 'I started with a $40 popcorn popper on my stove.', ['What $40 of green beans actually makes', 'The neighbour who became my first regular', 'Why we close on Mondays'], '#FF5B7B', 'Regulars who feel they already know you'],
  ['Real estate agents', 'Be the agent people feel they already know before they ever call.', 'What $400k actually buys you in this town right now.', ['3 things I check before any showing', 'The offer that won with less money', 'What first-time buyers always ask me'], '#65E5D8', 'Listings explained in your words, not a template'],
  ['Creators & agencies', 'Keep every client sounding like themselves, not like each other.', 'Every client, in their own voice. None of them sound alike.', ['One voice profile per client', 'Client sign-off before anyone films', '15 brands, one calendar'], '#B7AE9F', 'More clients without more writers'],
] as const
const PER: [string, string, number][] = [['Maya, 29', 'Thinking about starting a cart', 1], ['Dan, 41', 'Skeptic. Needs proof first', 1], ['Priya, 34', 'Home brewer, loves gear', 1], ['Leo, 22', 'Scrolls fast, short attention', 0], ['Rosa, 55', 'Loyal customer since day one', 1], ['Sam, 38', 'Side-hustle curious', 1], ['Jen, 31', 'Busy parent, watches at night', 0], ['Omar, 27', 'Coffee nerd, hates fluff', 1], ['Kate, 45', 'Local foodie', 1], ['Ben, 33', 'Budget-minded', 1]]
const OL = [['Learns you', 'Reads your videos until it knows how you talk.', '#FFB347'], ['Writes & tests', 'Your next script, tested on viewers like yours first.', '#FF5B7B'], ['You record', 'Read it off the teleprompter. No memorising.', '#F6F1E9'], ['Edits', 'Ums and restarts gone. Never a word you didn’t say.', '#65E5D8'], ['Posts', 'Out everywhere at your best time, then learns what landed.', '#8FEDE3']]
const INNER = ['Your voice profile', 'Trending in your niche', 'Content calendar', 'Comments → next ideas']
const VIDS = ['creator-coach-talking', 'maya-talking-kitchen', 'creator-realestate-talking', 'creator-agency-talking']
const DESK_FAQ = [['Is this an AI video maker?', 'Never. You’re always the one on camera, in your own voice. TwinAI does the writing, prompting, editing and posting around you. No avatars, no cloned voices.'], ['Will it sound like every other AI script?', 'It learns from your own videos and your answers, and keeps your words, your numbers and your endings. If a line doesn’t sound like you, change it and Twin learns from that.'], ['Who are the 10 viewers?', 'Simulated viewers built from the people who actually watch accounts like yours: the skeptic, the beginner, the almost-buyer. They test your opening before you film, so you don’t find out after a flop.'], ['Does it make things up?', 'It never invents a detail, a number or a quote you didn’t give. Anything it guesses stays marked as a guess until you confirm it.'], ['How long does one video take?', 'About 35 minutes from idea to scheduled, most of it filming. You can stop and come back at any point.'], ['What does it cost?', 'Your first 3 videos are free, no card. One credit covers one whole video, from script to teleprompter to edit to post. You’re never charged per step. After that, plans start at $9 a month.']]
const PHONE_FAQ = [['Is this an AI video maker?', 'No. You’re always the one on camera, in your own voice. No avatars, no cloned voices.'], ['Will it sound like every other AI script?', 'It learns from your own videos and keeps your words, your numbers and your endings.'], ['How long does one video take?', 'About 35 minutes from idea to scheduled, most of it filming.']]

/** Desktop (Landing.dc.html) values. */
export function useLandingDesktop() {
  const [ps, pickPs] = useHeldTicker(3600, 5, 12000)
  const [tk] = useTicker(140, 100000)
  const [tw, pickTw] = useHeldTicker(4800, 5, 15000)
  const [wo, pickWo] = useHeldTicker(5200, 4, 15000)
  const [oaN] = useTicker(33, 1_000_000)
  const [ty] = useTicker(80, 100000)
  const [faq, setFaq] = useState(0)

  return useMemo(() => {
    const oa = (oaN * 0.0042) % (Math.PI * 2)
    const words = 'There’s no clean formula. Anyone selling you a guaranteed roadmap is skipping the hard parts.'.split(' ')
    const wi = STATIC ? words.length : Math.floor(tk * 0.33) % (words.length + 6)
    const total = SEG.reduce((a, x) => a + x[0].length, 0)
    const k = STATIC ? total : ty % (total + 70)
    let left = Math.min(k, total)
    const segs = SEG.map((x) => { const t = x[0].slice(0, Math.max(0, left)); left -= x[0].length; return { t, u: x[1] ? '2px solid ' + x[1] : '0', c: x[1] ? '#F6F1E9' : '#E6DED2' } }).filter((x) => x.t.length)
    const shown = Math.min(k, total)
    const rv = STATIC ? 10 : Math.floor(tk / 5) % 16
    let stay = 0
    const pers = PER.map((x, i) => {
      const done = i < rv
      if (done && x[2]) stay++
      return { n: x[0], who: x[1], r: done ? (x[2] ? 'Kept watching' : 'Scrolled past') : 'Watching…', rc: done ? (x[2] ? '#8FEDE3' : '#FF8FA4') : '#6E675C', dot: done ? (x[2] ? '#65E5D8' : '#FF5B7B') : 'rgba(255,255,255,0.15)', bd: done ? (x[2] ? 'rgba(101,229,216,0.25)' : 'rgba(255,91,123,0.25)') : 'rgba(255,255,255,0.06)' }
    })
    const wl = W[wo][2].split(' ')
    const wk = STATIC ? wl.length : Math.floor(tk * 0.33) % (wl.length + 6)
    const inner = INNER.map((m, i) => { const a = -oa * 1.6 + (i * 2 * Math.PI) / 4; const x = 560 + 250 * Math.cos(a), y = 220 + 100 * Math.sin(a); return { t: m, x: (x - 80).toFixed(1) + 'px', y: (y - 13).toFixed(1) + 'px', op: (0.45 + (0.4 * (Math.sin(a) + 1)) / 2).toFixed(2) } })
    const orbs = OL.map((x, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + oa; const sn = Math.sin(a); const depth = (sn + 1) / 2; return { t: x[0], b: x[1], c: x[2], n: i + 1, x: (560 + 430 * Math.cos(a) - 120).toFixed(1) + 'px', y: (220 + 160 * sn - 46).toFixed(1) + 'px', sc: (0.86 + depth * 0.18).toFixed(3), op: (0.6 + depth * 0.4).toFixed(2), z: depth > 0.5 ? 3 : 1 } })
    return {
      orbs, moons: [], inner,
      hsteps: ([['Script', '#FFB347', [0, 1]], ['Film', '#FF5B7B', [2]], ['Edit', '#65E5D8', [3]], ['Post', '#8FEDE3', [4]]] as const).map((x, i) => { const on = (x[2] as readonly number[]).includes(ps); return { n: i + 1, t: x[0], arrow: i < 3, bd: on ? x[1] + '99' : 'rgba(255,255,255,0.08)', bg: on ? x[1] + '1F' : 'rgba(255,255,255,0.025)', fg: on ? '#F6F1E9' : '#8D8475', dot: on ? x[1] : 'rgba(255,255,255,0.12)', sc: on ? 1.08 : 1, sh: on ? '0 10px 30px -12px ' + x[1] : 'none' } }),
      p0: pos(0, ps), p1: pos(1, ps), p2: pos(2, ps), p3: pos(3, ps), p4: pos(4, ps),
      tabs: LOOP.map((x, i) => ({ n: '0' + (i + 1), t: x[0], c: x[2], on: i === ps, pick: () => pickPs(i) })),
      loop: LOOP.map((x, i) => ({ t: x[0], b: x[1], c: x[2], n: i + 1, on: i === ps })),
      pw: words.map((w, j) => ({ w: w + ' ', op: j < wi ? 0.22 : 1, c: j === wi ? '#FFCB85' : '#F6F1E9' })),
      t0: pos(0, tw), t1: pos(1, tw), t2: pos(2, tw), t3: pos(3, tw), t4: pos(4, tw),
      tour: TOUR.map((x, i) => ({ n: i + 1, t: x[0], on: i === tw, off: i !== tw, pick: () => pickTw(i), c: i === tw ? '#F6F1E9' : '#6E675C', dot: i < tw ? '#65E5D8' : i === tw ? 'linear-gradient(135deg,#FFB347,#FF5B7B)' : 'rgba(255,255,255,0.08)', dfg: i <= tw ? '#07070A' : '#8D8475', mark: i < tw ? '✓' : String(i + 1) })),
      tourT: TOUR[tw][0], tourB: TOUR[tw][1], tourK: TOUR[tw][2], tourN: 'Step ' + (tw + 1) + ' of 5',
      tNext: () => pickTw((tw + 1) % 5), tBack: () => pickTw(Math.max(0, tw - 1)), tNextLbl: tw === 4 ? 'Watch it again' : 'Next step →', canTBack: tw > 0,
      segs, typing: k < total, tag0: shown > 45, tag1: shown > 110, tag2: shown >= total,
      whos: W.map((x, i) => ({ t: x[0], b: x[1], c: x[4], on: i === wo, off: i !== wo, op: i === wo ? 1 : 0.45, bar: i === wo ? x[4] : 'rgba(255,255,255,0.08)', pick: () => pickWo(i) })),
      woCls: 'phfill lp-ph-' + ['coach', 'local', 'realestate', 'agency'][wo], woVid: VIDS[wo], woC: W[wo][4], woT: W[wo][0], woOut: W[wo][5],
      woIdeas: W[wo][3].map((t, i) => ({ t, k: wo + '-' + i, d: 0.2 + i * 0.2 + 's' })),
      woWords: wl.map((w, j) => ({ w: w + ' ', op: j < wk ? 0.25 : 1, c: j === wk ? '#FFCB85' : '#F6F1E9' })),
      pers, pStay: String(stay), pBar: stay * 10 + '%', pVerdict: rv >= 10 ? 'Strong opening. Twin keeps it, and tells you why the 2 left.' : 'Running your opening past each viewer…',
      faqs: DESK_FAQ.map((x, i) => ({ q: x[0], a: x[1], open: i === faq, sign: i === faq ? '−' : '+', pick: () => setFaq(faq === i ? -1 : i) })),
    }
  }, [ps, tk, tw, wo, oaN, ty, faq, pickPs, pickTw, pickWo])
}

/** Phone (MLanding.dc.html) values. */
export function useLandingPhone() {
  const [tk] = useTicker(160, 1000)
  const [faq, setFaq] = useState(0)
  return useMemo(() => {
    const words = 'Honestly? I started with a $40 popcorn popper on my stove.'.split(' ')
    const wi = STATIC ? words.length : Math.floor(tk * 0.3) % (words.length + 6)
    return {
      pw: words.map((w, j) => ({ w: w + ' ', op: j < wi ? 0.25 : 1, c: j === wi ? '#FFCB85' : '#F6F1E9' })),
      loop: OL.map((x, i) => ({ n: i + 1, t: x[0], b: x[1], c: x[2], last: i === 4, line: i < 4 })),
      faqs: PHONE_FAQ.map((x, i) => ({ q: x[0], a: x[1], open: i === faq, sign: i === faq ? '−' : '+', pick: () => setFaq(faq === i ? -1 : i) })),
    }
  }, [tk, faq])
}
