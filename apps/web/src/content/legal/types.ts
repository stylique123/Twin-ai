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
  glance: { tone: 'teal' | 'amber' | 'coral' | 'teal-soft'; title: string; body: string }[]
  sections: LegalSection[]
}

// Legal facts confirmed by the owner (2026-11-11). Setting one to null brings
// back the board's amber [placeholder] on the page.
/** Effective / last-updated date, e.g. 'November 11, 2026'. */
export const LEGAL_LAST_UPDATED: string | null = 'November 11, 2026'
/** Real contact address for privacy and legal requests. */
export const LEGAL_CONTACT_EMAIL: string | null = 'hello@twinai.studio'
/** How soon data is deleted after a deletion request, e.g. '30 days'. */
export const LEGAL_DELETION_WINDOW: string | null = '30 days'
/** Governing law: the state/country where Twin Studios LLC is registered. */
export const LEGAL_GOVERNING_LAW: string | null = 'the State of Wyoming, United States'
