// CI guard: the VPS retirement tooling can delete things on the box that runs
// production renders. These are the properties that make that safe, frozen so
// they cannot be lost by a later edit that looks harmless.
//
//   1. The read-only COLLECTOR must stay read-only. Every `docker …` invocation
//      in it must be on the read allowlist. A single `docker rm` added there
//      would run on every diagnostic, with no gate in front of it.
//   2. Every MUTATING stage of vps-retire.yml must require the confirm phrase.
//      A stage that slips out of that case arm becomes reachable by a plain
//      dispatch.
//   3. The retirement workflow must never use `docker system prune` or
//      `docker volume prune` — broad sweeps ignore the classification and would
//      collect exactly the resources the plan deliberately refused to touch.
//   4. The executed commands must come from the generated plan, not from a
//      literal list in the workflow — otherwise the generator's rules and what
//      actually runs can drift apart.
//
//   node scripts/ci/check_vps_retire_safety.mjs
//   node scripts/ci/check_vps_retire_safety.mjs --selftest
import { readFileSync } from 'node:fs'

const COLLECTOR = 'scripts/vps/collect_resource_inventory.sh'
const RETIRE_WF = '.github/workflows/vps-retire.yml'

// Read-only docker invocations. Two-word forms are listed explicitly, because
// `docker system df` is a read and `docker system prune` is not.
const READ_ONLY_DOCKER = new Set([
  'ps', 'images', 'inspect', 'logs', 'info', 'exec', 'network ls', 'network inspect',
  'volume ls', 'volume inspect', 'system df', 'container ls', 'image ls', 'image inspect',
])
const MUTATING_STAGES = ['disable-restart', 'stop', 'remove-container', 'reclaim']

const strip = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')

// Pull out every `docker <verb>[ <subverb>]` occurrence. Sub-verb is only kept
// when the verb is one that HAS sub-verbs, so `docker ps -a` does not read as
// the invocation "ps -a".
export function dockerInvocations(text) {
  const out = []
  for (const m of strip(text).matchAll(/\bdocker\s+([a-z]+)(?:\s+([a-z]+))?/g)) {
    const [, verb, sub] = m
    out.push(['network', 'volume', 'system', 'container', 'image', 'builder'].includes(verb) && sub
      ? `${verb} ${sub}` : verb)
  }
  return out
}

export function evaluate({ collector, retireWf }) {
  const reasons = []

  // 1. Collector stays read-only.
  for (const inv of new Set(dockerInvocations(collector))) {
    if (!READ_ONLY_DOCKER.has(inv)) {
      reasons.push(`collector uses a non-read-only docker invocation: "docker ${inv}"`)
    }
  }

  const wf = strip(retireWf)

  // 2. Every mutating stage sits behind the confirm phrase.
  //
  // The gate is a shell `case`. Each arm must be paired with ITS OWN body: a
  // naive lazy match from the first arm header to the first CONFIRM_PHRASE
  // spans straight across the read-only arm into the gated one, and then reports
  // the read-only stages as guarded. That reads as a pass while every mutating
  // stage is in fact ungated — a fail-open in the guard itself. So parse arms.
  const arms = []
  const armRe = /^[ \t]*([a-z][a-z|*-]*)\)[ \t]*$/gm
  const heads = [...wf.matchAll(armRe)]
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].index + heads[i][0].length
    const end = i + 1 < heads.length ? heads[i + 1].index : wf.length
    arms.push({ stages: heads[i][1].split('|'), body: wf.slice(start, end) })
  }
  const guarded = new Set(arms.filter((a) => a.body.includes('CONFIRM_PHRASE')).flatMap((a) => a.stages))
  for (const s of MUTATING_STAGES) {
    if (!guarded.has(s)) reasons.push(`stage "${s}" mutates the host but is not in an arm that checks CONFIRM_PHRASE`)
  }
  // …and no mutating stage may sit in an arm that does NOT check the phrase.
  for (const a of arms.filter((x) => !x.body.includes('CONFIRM_PHRASE'))) {
    for (const s of a.stages) {
      if (MUTATING_STAGES.includes(s)) reasons.push(`stage "${s}" is mutating but sits in an ungated case arm`)
    }
  }

  // 3. No broad sweeps. `builder prune` IS allowed — it reaches the build cache
  //    only, and the plan emits it solely when Docker reports zero active entries.
  for (const bad of ['system prune', 'volume prune', 'image prune', 'container prune', 'network prune']) {
    if (wf.includes(`docker ${bad}`)) reasons.push(`retirement workflow uses \`docker ${bad}\` — a broad sweep ignores the classification`)
  }

  // 4. Commands are read from the plan, not written in the workflow.
  if (!/jq -r '\.cmds\[\]' plan\.json/.test(wf)) {
    reasons.push('the execute step does not read its commands from plan.json — the generator and the executed list could drift apart')
  }
  // The execute step must not contain literal destructive docker calls.
  const execStep = wf.match(/name: Execute the plan on the host[\s\S]*?(?=\n      - name:)/)
  if (execStep && /docker\s+(rm|rmi|stop|kill|update|prune)/.test(execStep[0])) {
    reasons.push('the execute step contains a literal destructive docker command instead of only the generated plan')
  }

  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  let failed = 0
  const t = (name, got, exp) => { if (got === exp) console.log(`  ok: ${name}`); else { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ } }

  const collector = `docker ps -a --format '{{.Names}}'
docker inspect "$n" --format x
docker volume ls
docker system df
docker exec "$TW" du -sk /tmp
docker network inspect "$nid"`
  const retireWf = `          case "$STAGE" in
            manifest|observe|accept)
              echo "read-only stage" ;;
            disable-restart|stop|remove-container|reclaim)
              if [ '\${{ inputs.confirm }}' != "$CONFIRM_PHRASE" ]; then exit 1; fi ;;
          esac
      - name: Execute the plan on the host
        run: |
          jq -r '.cmds[]' plan.json > exec.sh
          cat exec.sh | ssh root@host bash -s
      - name: Upload evidence
        run: true`
  const good = { collector, retireWf }

  t('clean tooling passes', evaluate(good).ok, true)
  t('a docker rm in the collector is rejected',
    evaluate({ ...good, collector: collector + '\ndocker rm foo' }).ok, false)
  t('a docker restart in the collector is rejected',
    evaluate({ ...good, collector: collector + '\ndocker restart stylique-os' }).ok, false)
  t('docker system prune in the collector is rejected',
    evaluate({ ...good, collector: collector + '\ndocker system prune -a' }).ok, false)
  t('docker system df in the collector is FINE (read)',
    evaluate({ ...good, collector: 'docker system df' }).ok, true)
  t('moving a mutating stage into the read-only arm is rejected',
    evaluate({ ...good, retireWf: retireWf.replace('manifest|observe|accept)', 'manifest|observe|accept|reclaim)') }).ok, false)
  t('dropping a mutating stage from the gated arm is rejected',
    evaluate({ ...good, retireWf: retireWf.replace('disable-restart|stop|remove-container|reclaim)', 'disable-restart|stop)') }).ok, false)
  t('docker system prune in the workflow is rejected',
    evaluate({ ...good, retireWf: retireWf + '\n        run: docker system prune -af' }).ok, false)
  t('docker volume prune in the workflow is rejected',
    evaluate({ ...good, retireWf: retireWf + '\n        run: docker volume prune -f' }).ok, false)
  t('an execute step not reading plan.json is rejected',
    evaluate({ ...good, retireWf: retireWf.replace("jq -r '.cmds[]' plan.json", 'echo docker rm x') }).ok, false)
  t('a literal destructive command in the execute step is rejected',
    evaluate({ ...good, retireWf: retireWf.replace('cat exec.sh | ssh root@host bash -s', 'ssh root@host docker rmi everything') }).ok, false)

  if (failed) { console.error(`vps-retire-safety selftest: ${failed} failed`); process.exit(1) }
  console.log('vps-retire-safety selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  const { ok, reasons } = evaluate({
    collector: readFileSync(COLLECTOR, 'utf8'),
    retireWf: readFileSync(RETIRE_WF, 'utf8'),
  })
  console.log(`vps-retire-safety: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}
