export type LegalRun =
  | { t: string; b?: boolean; placeholder?: boolean; contact?: undefined }
  | { contact: true; t?: undefined; b?: undefined; placeholder?: undefined }

export type LegalBlock = { kind: 'p' | 'key' | 'li'; runs: LegalRun[] }

export type LegalSection = { n: number; h: string; sum: string; blocks: LegalBlock[] }

export type LegalDoc = {
  eyebrow: string
  title: string
  lede: string
  full: string
  glance: { tone: 'teal' | 'amber' | 'coral'; title: string; body: string }[]
  sections: LegalSection[]
}

/** Contact address shown in the legal pages (from the design boards' mailto). */
export const LEGAL_CONTACT_EMAIL = 'hello@twinai.studio'
/** Set to e.g. 'November 11, 2026' once counsel signs off. null renders a visible [date]. */
export const LEGAL_LAST_UPDATED: string | null = null
