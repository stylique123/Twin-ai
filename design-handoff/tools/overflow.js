// node overflow.js <url> [out-prefix]: checks every target width for sideways overflow
const { chromium } = require('playwright')
const [,, url, out] = process.argv
;(async () => {
  const b = await chromium.launch()
  for (const w of [375,390,430,744,820,1024,1180,1366,1440,1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' })
    await p.goto(url, { waitUntil: 'networkidle' }); await p.evaluate(() => document.querySelectorAll('[class*=rv-]').forEach(e => e.classList.add('in'))); await p.waitForTimeout(1500)
    const r = await p.evaluate(() => {
      const W = innerWidth; const bad = []
      for (const e of document.querySelectorAll('body *')) { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (b.width && b.right > W + 1 && cs.position !== 'fixed' && !e.closest('[aria-hidden=true]') && !(() => { for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).opacity === '0') return true; return false })()) bad.push(e.tagName + '.' + (e.className.baseVal ?? e.className).toString().slice(0, 40) + ' r=' + Math.round(b.right)) }
      const small = [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.trim().slice(0, 20))
      return { scroll: document.documentElement.scrollWidth > W, bad: bad.slice(0, 4), small: small.slice(0, 4) }
    })
    console.log(w, JSON.stringify(r))
    if (out) await p.screenshot({ path: `${out}-${w}.png`, fullPage: true })
    await p.close()
  }
  await b.close()
})()
