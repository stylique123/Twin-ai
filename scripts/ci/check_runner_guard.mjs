// Every workflow job must pick its runner through the public-repo guard:
// a public repo always gets GitHub's hosted runner, whatever CI_RUNNER says,
// so a pull request from a fork can never execute on a self-hosted machine.
import { readdirSync, readFileSync } from 'node:fs'

const GUARDED = "runs-on: ${{ (!github.event.repository.private || !vars.CI_RUNNER) && 'ubuntu-latest' || vars.CI_RUNNER }}"
const dir = '.github/workflows'
const bad = []
for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
  readFileSync(`${dir}/${f}`, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('runs-on:') && t !== GUARDED) bad.push(`${f}:${i + 1}: ${t}`)
  })
}
if (bad.length) {
  console.error('runner-guard: jobs must use the public-repo runner guard:\n  ' + bad.join('\n  '))
  process.exit(1)
}
console.log('runner-guard: OK')
