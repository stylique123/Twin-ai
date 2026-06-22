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

export interface PlanTier {
  id: 'free' | 'aspiring' | 'professional' | 'agency'
  name: string
  price: number // monthly USD (intro pricing)
  annual: number | null // per-month when billed annually
  videos: number // ADVERTISED recreations / mo (what marketing shows)
  credits: number // INTERNAL granted credits, includes a hidden buffer above `videos`
  brandVoices: number
  badge?: string
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
    credits: grant(3, 0), // 30 credits → 3 recreations; advertised count matches what's granted
    brandVoices: 1,
    blurb: 'See it work, free.',
    features: ['3 free remixes', 'Script + in-app teleprompter record', 'Watermark on exports'],
  },
  {
    id: 'aspiring',
    name: 'Starter',
    price: 9,
    annual: 7,
    videos: 8,
    credits: grant(8, 2), // 100 credits → 10, advertised 8, buffer 2
    brandVoices: 1,
    blurb: 'Post weekly, no watermark.',
    features: [
      '8 remixes / mo',
      'No watermark',
      '1 brand voice',
      'Auto-captions',
      'Post to 1 platform',
    ],
  },
  {
    id: 'professional',
    name: 'Pro',
    price: 24,
    annual: 19,
    videos: 20,
    credits: grant(20, 4), // 240 credits → 24, advertised 20, buffer 4
    brandVoices: 1,
    badge: 'Most popular',
    blurb: 'Ship every week, on autopilot.',
    features: [
      '20 remixes / mo',
      '1 brand voice',
      'Full auto-edit (captions + cuts)',
      'Publish to all your platforms',
      'Ad-mode variations',
      'Analytics',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 79,
    annual: 65,
    videos: 75,
    credits: grant(75, 8), // 830 credits → 83, advertised 75, buffer 8
    brandVoices: 15,
    badge: 'Best value',
    blurb: 'Every client, sounding like themselves.',
    features: [
      '75 remixes / mo',
      '15 brand voices (one per client)',
      'Everything in Pro',
      'Switch client brands on web & mobile',
      'Priority render',
      'Add extra brand voices anytime',
    ],
  },
]

// Add-on: extra brand voice beyond the plan's included count.
export const EXTRA_BRAND_VOICE_PRICE = 9 // USD / mo each

// Look up a plan tier by id (defaults to Free).
export const planFor = (id: string | null | undefined): PlanTier =>
  PLANS.find((p) => p.id === id) ?? PLANS[0]

// Convert an internal credit balance into the friendly "recreations" count we
// show users. This is the ONLY credit-derived number that reaches the UI.
export const videosFromCredits = (credits: number) => Math.floor(credits / VIDEO_COST)

// Internal per-action metering, used server-side for cost accounting only.
// Never surfaced in the UI.
export const CREDIT_COST = {
  referenceAnalysis: 2,
  blueprintGeneration: 4,
  render: 4,
  schedulePost: 2,
} as const

// Cost (internal) charged for one recreation.
export const BLUEPRINT_COST = VIDEO_COST
