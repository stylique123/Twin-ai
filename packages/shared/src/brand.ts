// Brand & GTM constants, single source of truth, mirrors the cheat sheet.

export const BRAND = {
  oneLiner: 'One link in. A finished, on-brand video out.',
  subLine: 'Script, teleprompter, auto-edit and caption — the whole loop in one window.',
  category: 'Reference-based creation, not a clipper.',
  positioning:
    'For creators, founders & agencies who know a reel works but can’t make their own fast enough, TwinAI turns any proven reference into a personalized hook, script, shot list, edit and schedule. Others clip your footage; we make the references you admire shootable in your voice.',
  // Voice guardrails from the cheat sheet
  use: ['remix', 'reference', 'blueprint', 'shootable', 'your voice', 'momentum'],
  avoid: ['copy / steal', 'guaranteed viral', 'synergy', '10x overnight'],
}

// Master switch: paid checkout is "Coming soon" until we flip this on (one line).
// Free signup + free remixes always work regardless.
export const PAYMENTS_LIVE = false

// Master switch: one-click posting (platform OAuth). The adapters (TikTok/
// Instagram/LinkedIn/YouTube), the `social` edge function's connect/publish
// flow, and the `publish_due` cron are built and verified — flip this on so
// Calendar's Connect buttons go live. Any platform whose developer-app keys
// aren't set yet in Supabase still degrades gracefully to "coming soon" for
// that platform only (`ad.configured()` in supabase/functions/social).
export const POSTING_LIVE = true

export interface PlanTier {
  id: 'free' | 'aspiring' | 'professional' | 'studio' | 'agency'
  name: string
  price: number // monthly USD (intro pricing)
  annual: number | null // per-month when billed annually
  videos: number // ADVERTISED recreations / mo (what marketing shows)
  credits: number // INTERNAL granted credits, includes a hidden buffer above `videos`
  brandVoices: number
  badge?: string
  hidden?: boolean // Free: excluded from the pricing grid (reached via "Start free")
  blurb: string
  features: string[]
}

// Hidden grace buffer: we grant ~10-25% more recreations than we advertise so a
// glitch, a regen, or normal variance never makes a user feel shorted. They only
// ever see "X left" (a remaining count), never a total that contradicts marketing.
export const grant = (videos: number, buffer: number) => (videos + buffer) * 10

// --- Plans -----------------------------------------------------------------
// Users NEVER see credits or per-action costs. They see plans framed as a
// simple monthly recreation allowance. "credits" below is an INTERNAL unit we
// meter against for cost control; it is converted to a friendly "recreations"
// number for display and never shown as a per-action price.

// Internal credits consumed by one full recreation (analyze + script + edit).
export const VIDEO_COST = 10

// Intro launch pricing. videos = advertised; credits = granted (with hidden buffer).
export const PLANS: PlanTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    annual: null,
    videos: 3,
    credits: grant(3, 0), // 30 credits → 3 free remixes
    brandVoices: 1,
    hidden: true, // not shown on the pricing grid — reached via "Get started for free"
    blurb: 'See it work, free.',
    features: ['3 free remixes', 'Script + in-app teleprompter record', 'Watermark on exports'],
  },
  {
    id: 'aspiring',
    name: 'Creator',
    price: 9,
    annual: 7,
    videos: 7,
    credits: grant(7, 1), // 80 credits, advertised 7, buffer 1
    brandVoices: 1,
    blurb: 'Post weekly, no watermark.',
    features: [
      '7 videos / mo',
      'No watermark',
      '1 brand voice',
      'Auto-captions',
      'Post to 1 platform',
    ],
  },
  {
    id: 'professional',
    name: 'Pro',
    price: 25,
    annual: 20,
    videos: 15,
    credits: grant(15, 3), // 180 credits, advertised 15, buffer 3
    brandVoices: 1,
    badge: 'Most popular',
    blurb: 'Ship every week, on autopilot.',
    features: [
      '15 videos / mo',
      '1 brand voice',
      'Full auto-edit (captions + cuts)',
      'Publish to all your platforms',
      'Content calendar',
      'Analytics',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    price: 49,
    annual: 39,
    videos: 35,
    credits: grant(35, 5), // 400 credits, advertised 35, buffer 5
    brandVoices: 1,
    badge: 'Best for volume',
    blurb: 'Double the output, priority render.',
    features: [
      '35 videos / mo',
      'Everything in Pro',
      'Priority render',
      'Bulk scheduling',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 99,
    annual: 79,
    videos: 80,
    credits: grant(80, 8), // 880 credits, advertised 80, buffer 8
    brandVoices: 15,
    badge: 'Best value',
    blurb: 'Every client, sounding like themselves.',
    features: [
      '80 videos / mo',
      '15 brand voices (one per client)',
      'Everything in Studio',
      'Workspaces & client switching',
      'White-label client reports',
      'Add extra brand voices anytime',
    ],
  },
]

// Expansion revenue: à-la-carte REMIX TOP-UPS only. These are one-off packs that
// never expire and are NOT part of the monthly allowance — a subscriber buys the
// basic plan and tops up remixes as needed. (Extra brand voices / seats are NOT
// à-la-carte — they come with the Studio/Agency tiers.)
export const REMIX_TOPUPS = [
  { id: 'topup_10', remixes: 10, price: 15 },
  { id: 'topup_20', remixes: 20, price: 25 },
]

// Extra brand voices are NOT à-la-carte for everyone — they're an Agency/Studio
// capability (priced per extra voice on those plans, surfaced in Workspaces).
export const EXTRA_BRAND_VOICE_PRICE = 9 // USD / mo each (Agency/Studio only)

export interface AddOn { id: string; name: string; desc: string; price: number; unit: string }
export const ADD_ONS: AddOn[] = REMIX_TOPUPS.map((t) => ({
  id: t.id,
  name: `${t.remixes} remixes`,
  desc: `A one-off pack of ${t.remixes} extra remixes. They never expire — use them any month you have an active plan.`,
  price: t.price,
  unit: 'once',
}))

// Look up a plan tier by id (defaults to Free).
export const planFor = (id: string | null | undefined): PlanTier =>
  PLANS.find((p) => p.id === id) ?? PLANS[0]

// Convert an internal credit balance into the friendly "recreations" count we
// show users. This is the ONLY credit-derived number that reaches the UI.
export const videosFromCredits = (credits: number) => Math.floor(credits / VIDEO_COST)

// NOTE: the real per-recreation cost is env-driven SERVER-SIDE (RECREATION_COST
// in generate-blueprint). VIDEO_COST above only drives the client-side
// "videos left" display — keep the two in sync when changing either.
