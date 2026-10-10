import { describe, expect, it } from 'vitest'
import { subpagesByRole } from '../productSubpages.js'
import { ldFaqLines } from '../ldFaq.js'

describe('v3.1 1.2: one page per role, up to five', () => {
  it('takes the first link for each role instead of three pricing pages', () => {
    const h = '<a href="/plans">a</a><a href="/pricing">b</a><a href="/prices">c</a><a href="/features">d</a><a href="/demo">e</a><a href="/curriculum">f</a><a href="/faq">g</a><a href="https://other.com/tour">x</a>'
    expect(subpagesByRole(h, 'https://flowdesk.example/')).toEqual([
      { role: 'offer', url: 'https://flowdesk.example/plans' },
      { role: 'how', url: 'https://flowdesk.example/features' },
      { role: 'screens', url: 'https://flowdesk.example/demo' },
      { role: 'inside', url: 'https://flowdesk.example/curriculum' },
      { role: 'questions', url: 'https://flowdesk.example/faq' },
    ])
  })
  it('never another site, never the page itself', () => {
    expect(subpagesByRole('<a href="https://other.com/pricing">p</a><a href="/pricing/">s</a>', 'https://x.example/pricing')).toEqual([])
  })
})

describe('v3.1 1.2: FAQ from the page structured data', () => {
  it('reads FAQPage questions with answers', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'Is the roast fresh?', acceptedAnswer: { '@type': 'Answer', text: '<p>Roasted weekly at Maya\'s Coffee.</p>' } },
      { '@type': 'Question', name: 'No answer' },
    ] }
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
    expect(ldFaqLines(html)).toEqual(["Q: Is the roast fresh? A: Roasted weekly at Maya's Coffee."])
  })
  it('ignores broken json and pages without a FAQ', () => {
    expect(ldFaqLines('<script type="application/ld+json">{bad</script>')).toEqual([])
    expect(ldFaqLines('<p>hi</p>')).toEqual([])
  })
})
