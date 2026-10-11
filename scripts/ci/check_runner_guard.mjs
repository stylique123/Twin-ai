// Pinned to ubuntu-24.04 (owner 13 Oct): GitHub moves ubuntu-latest to Ubuntu 26.04
// from 19 Oct 2026 (actions/runner-images#14748).
// Every workflow job must pick its runner through the public-repo guard:
// a public repo always gets GitHub's hosted runner, whatever CI_RUNNER says,
// so a pull request from a fork can never execute on a self-hosted machine.
import { readdirSync, readFileSync } from 'node:fs'

const GUARDED = "runs-on: ${{ (!github.event.repository.private || !vars.CI_RUNNER) && 'ubuntu-24.04' || vars.CI_RUNNER }}"
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
