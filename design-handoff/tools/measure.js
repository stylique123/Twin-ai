// node measure.js <url> <width> <stepsJSON> <targetJS> <outPrefix> [height]
// steps: [{text:"..."}|{role:"button",name:"..."}|{wait:ms}]
// targetJS: a JS expression evaluated in the page returning the target element.
const { chromium } = require('playwright')
const fs = require('fs')
const [,, url, w, stepsJSON, targetJS, out, h] = process.argv
const PROPS = ['display','position','width','height','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','gap','rowGap','columnGap','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textTransform','color','backgroundColor','backgroundImage','borderTopWidth','borderTopColor','borderTopStyle','borderRadius','boxShadow','opacity','flexDirection','alignItems','justifyContent','gridTemplateColumns','textAlign','backdropFilter']
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: +w, height: +(h || 900) }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
  for (const s of JSON.parse(stepsJSON)) {
    if (s.wait) await p.waitForTimeout(s.wait)
    else if (s.text) await p.getByText(s.text, { exact: true }).first().click()
    else if (s.role) await p.getByRole(s.role, { name: s.name, exact: true }).first().click()
    else if (s.eval) await p.evaluate(s.eval)
    await p.waitForTimeout(400)
  }
  await p.waitForTimeout(800)
  if (targetJS === 'PAGE') { await p.screenshot({ path: out + '.png', fullPage: true }); console.log(out, 'full page'); await b.close(); return }
  const el = await p.evaluateHandle(`(${targetJS})`)
  const box = await el.asElement().boundingBox()
  await el.asElement().screenshot({ path: out + '.png' })
  const styles = await p.evaluate(({ root, PROPS }) => {
    const r0 = root.getBoundingClientRect(); const out = []
    const walk = (e, path) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
      if (r.width && r.height && cs.visibility !== 'hidden') {
        const o = { path, tag: e.tagName.toLowerCase(), text: [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 60), x: Math.round(r.x - r0.x), y: Math.round(r.y - r0.y), w: Math.round(r.width), h: Math.round(r.height) }
        for (const k of PROPS) o[k] = cs[k]
        out.push(o)
      }
      ;[...e.children].forEach((c, i) => walk(c, path + '>' + i))
    }
    walk(root, '0'); return out
  }, { root: el, PROPS })
  fs.writeFileSync(out + '.json', JSON.stringify({ box, styles }, null, 1))
  console.log(out, JSON.stringify(box), styles.length + ' elements')
  await b.close()
})()
