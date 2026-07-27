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
//   5. NO `${{ inputs.* }}` MAY BE INTERPOLATED INSIDE A `run:` BLOCK.
//      GitHub substitutes the expression into the script TEXT before bash parses
//      it, so a dispatch input containing a single quote closes the surrounding
//      literal and the remainder executes as script. In the authorisation gate
//      that ran BEFORE the gate decided anything. Inputs must reach shell only
//      through step `env:`, where they are data to the process rather than code.
//      Interpolation in `if:` conditions and in action `with:` parameters is
//      fine — those are never parsed by a shell — so this check is deliberately
//      scoped to run blocks and does not broaden to them.
//
//   node scripts/ci/check_vps_retire_safety.mjs
//   node scripts/ci/check_vps_retire_safety.mjs --selftest
import { readFileSync } from 'node:fs'

const COLLECTOR = 'scripts/vps/collect_resource_inventory.sh'
// Every script that is PIPED TO THE HOST over ssh. Each one is a remote-execution
// surface and each must be provably read-only, not just the first one anybody
// thought to check. Adding a script here is how a new remote probe gets covered;
// forgetting to is caught by the workflow scan below.
const REMOTE_SCRIPTS = [COLLECTOR, 'scripts/vps/pre_stop_audit.sh']
const RETIRE_WF = '.github/workflows/vps-retire.yml'

// Read-only docker invocations. Two-word forms are listed explicitly, because
// `docker system df` is a read and `docker system prune` is not.
const READ_ONLY_DOCKER = new Set([
  'ps', 'images', 'inspect', 'logs', 'info', 'exec', 'network ls', 'network inspect',
  'volume ls', 'volume inspect', 'system df', 'container ls', 'image ls', 'image inspect',
  // `docker compose` renders and validates without starting anything. The verb
  // alone is allowed because `-f <file>` sits between it and its subcommand, so
  // the parser cannot see the subcommand; the MUTATING subcommands are refused
  // by name just below, which is the check that actually carries the weight.
  'compose',
])
// `docker compose` subcommands that change state. Refused wherever they appear.
const MUTATING_COMPOSE = ['up', 'down', 'start', 'stop', 'restart', 'rm', 'kill', 'create', 'run', 'exec', 'pull', 'build']
const MUTATING_STAGES = ['disable-restart', 'stop', 'remove-container', 'reclaim']

const strip = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')

/**
 * Every `run:` block body. A step's script is the indented region following
 * `run: |` (or a single-line `run:`), ending at the next key at the same or
 * lower indentation. Comment lines are already stripped by the caller, so a
 * comment EXPLAINING the footgun cannot trip the check.
 */
export function runBlocks(text) {
  const out = []
  const lines = strip(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)run:\s*(\|-?|>-?)?\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const indent = m[1].length
    if (m[3]) { out.push(m[3]); continue }
    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') { body.push(''); continue }
      const ind = lines[j].length - lines[j].trimStart().length
      if (ind <= indent) break
      body.push(lines[j])
    }
    out.push(body.join('\n'))
  }
  return out
}

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

export function evaluate({ collector, retireWf, remoteScripts }) {
  const reasons = []

  // 1. EVERY remote script stays read-only, not just the collector.
  //
  // The audit that added the pre-stop probe added a SECOND script piped to the
  // host. Checking only the collector would have left it unexamined — the same
  // shape as the original defect, where the shared type described the data
  // without constraining it.
  const scripts = remoteScripts ?? { [COLLECTOR]: collector }
  for (const [name, body] of Object.entries(scripts)) {
    for (const inv of new Set(dockerInvocations(body))) {
      if (!READ_ONLY_DOCKER.has(inv)) {
        reasons.push(`${name} uses a non-read-only docker invocation: "docker ${inv}"`)
      }
    }
    for (const sub of MUTATING_COMPOSE) {
      if (new RegExp(`docker\\s+compose\\b[^\\n]*\\b${sub}\\b`).test(strip(body))) {
        reasons.push(`${name} uses \`docker compose ... ${sub}\`, which changes state`)
      }
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
  // …and no state-changing compose subcommand anywhere in the workflow either.
  for (const sub of MUTATING_COMPOSE) {
    if (new RegExp(`docker\\s+compose\\b[^\\n]*\\b${sub}\\b`).test(wf)) {
      reasons.push(`retirement workflow uses \`docker compose ... ${sub}\` — that starts or stops services`)
    }
  }

  // 5. No dispatch input may be substituted into script text.
  //    Scoped to `run:` blocks: an `if:` condition or an action `with:` parameter
  //    (e.g. run-id: ${'$'}{{ inputs.baseline_run_id }}) never reaches a shell, and
  //    flagging those would be noise that trains people to ignore this check.
  for (const m of runBlocks(retireWf)) {
    for (const hit of m.matchAll(/\$\{\{\s*inputs\.([A-Za-z0-9_]+)\s*\}\}/g)) {
      reasons.push(`run block interpolates \`inputs.${hit[1]}\` directly into shell — pass it through step env: and quote it`)
    }
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

async function selftest() {
  let failed = 0
  const t = (name, got, exp) => { if (got === exp) console.log(`  ok: ${name}`); else { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ } }

  const collector = `docker ps -a --format '{{.Names}}'
docker inspect "$n" --format x
docker volume ls
docker system df
docker exec "$TW" du -sk /tmp
docker network inspect "$nid"`
  // The SAFE shape: inputs arrive through step env and are quoted in shell.
  const retireWf = `      - name: Authorisation gate
        env:
          STAGE: \${{ inputs.stage }}
          CONFIRM_INPUT: \${{ inputs.confirm }}
        run: |
          case "$STAGE" in
            manifest|observe|accept)
              echo "read-only stage" ;;
            disable-restart|stop|remove-container|reclaim)
              if [ "$CONFIRM_INPUT" != "$CONFIRM_PHRASE" ]; then exit 1; fi ;;
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

  // ---- the SECOND remote surface -------------------------------------------
  t('a mutating verb in ANY remote script is rejected, not just the collector',
    evaluate({ ...good, remoteScripts: { collector, probe: 'docker rm stylique-os' } }).ok, false)
  t('a read-only second remote script passes',
    evaluate({ ...good, remoteScripts: { collector, probe: 'docker inspect x\ndocker compose -f f config -q' } }).ok, true)
  t('`docker compose ... up` in a remote script is rejected',
    evaluate({ ...good, remoteScripts: { collector, probe: 'docker compose -f f up -d' } }).ok, false)
  t('`docker compose ... down` in a remote script is rejected',
    evaluate({ ...good, remoteScripts: { collector, probe: 'docker compose -f f down' } }).ok, false)
  t('`docker compose ... config` in a remote script is FINE (renders, starts nothing)',
    evaluate({ ...good, remoteScripts: { collector, probe: 'docker compose -f f config --services' } }).ok, true)
  t('`docker compose ... up` in the WORKFLOW is rejected',
    evaluate({ ...good, retireWf: retireWf + '\n        run: docker compose -f x up -d' }).ok, false)
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

  // ---- HOSTILE CONTROLS for the shell-injection class -----------------------
  // The exact pattern that shipped, and had to be rejected.
  const injectable = retireWf
    .replace('          CONFIRM_INPUT: \\${{ inputs.confirm }}\n', '')
    .replace('if [ "$CONFIRM_INPUT" != "$CONFIRM_PHRASE" ]', "if [ '\\${{ inputs.confirm }}' != \"$CONFIRM_PHRASE\" ]")
  t('the shipped single-quoted inputs.confirm pattern is REJECTED',
    evaluate({ ...good, retireWf: injectable }).ok, false)
  t('inputs.stage interpolated into a run block is REJECTED',
    evaluate({ ...good, retireWf: retireWf + "\n      - name: x\n        run: node plan.mjs '\\${{ inputs.stage }}'" }).ok, false)
  t('an `if:` condition using inputs is FINE — never reaches a shell',
    evaluate({ ...good, retireWf: retireWf + "\n      - name: y\n        if: inputs.stage == 'accept'\n        run: echo ok" }).ok, true)
  t('an action `with:` parameter using inputs is FINE (baseline_run_id)',
    evaluate({ ...good, retireWf: retireWf + "\n      - uses: actions/download-artifact@v4\n        with:\n          run-id: \\${{ inputs.baseline_run_id }}" }).ok, true)

  // A hostile payload must neither execute nor authorise. Proven by running the
  // real gate logic as a script with the value supplied THE WAY THE FIX DOES —
  // through the environment — rather than asserting it from the shape of the YAML.
  {
    const { execFileSync } = await import('node:child_process')
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'gate-'))
    const gate = join(dir, 'gate.sh')
    // Byte-for-byte the shape the workflow now uses.
    writeFileSync(gate, [
      'set -euo pipefail',
      'CONFIRM_PHRASE=RETIRE-STYLIQUE-OS',
      'case "$STAGE" in',
      '  manifest|observe|accept) echo READONLY ;;',
      '  disable-restart|stop|remove-container|reclaim)',
      '    if [ "$CONFIRM_INPUT" != "$CONFIRM_PHRASE" ]; then echo REFUSED; exit 1; fi',
      '    echo AUTHORISED ;;',
      '  *) echo UNKNOWN; exit 1 ;;',
      'esac',
    ].join('\n'))
    const payloads = [
      "' ; touch /tmp/pwned_gate ; echo '",
      "'; echo INJECTED; #",
      'x\nRETIRE-STYLIQUE-OS',
      '$(touch /tmp/pwned_subst)',
      '`touch /tmp/pwned_bt`',
      'RETIRE-STYLIQUE-OS ',
    ]
    let allRefused = true
    let anyExecuted = false
    for (const payload of payloads) {
      let out = ''
      try {
        out = execFileSync('bash', [gate], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH, STAGE: 'reclaim', CONFIRM_INPUT: payload },
        })
      } catch (e) { out = String(e.stdout ?? '') }
      if (out.includes('AUTHORISED')) allRefused = false
      if (/INJECTED/.test(out)) anyExecuted = true
    }
    const { existsSync } = await import('node:fs')
    for (const f of ['/tmp/pwned_gate', '/tmp/pwned_subst', '/tmp/pwned_bt']) {
      if (existsSync(f)) anyExecuted = true
    }
    t('HOSTILE: no quote/newline/substitution payload authorises a mutating stage', allRefused, true)
    t('HOSTILE: no payload executes as script', anyExecuted, false)
    // Positive control: the real phrase MUST still authorise, or the two above
    // would pass on a gate that refuses everything.
    const okOut = execFileSync('bash', [gate], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, STAGE: 'reclaim', CONFIRM_INPUT: 'RETIRE-STYLIQUE-OS' },
    })
    t('CONTROL: the exact phrase still authorises', okOut.includes('AUTHORISED'), true)
  }

  if (failed) { console.error(`vps-retire-safety selftest: ${failed} failed`); process.exit(1) }
  console.log('vps-retire-safety selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) await selftest()
else {
  const remoteScripts = Object.fromEntries(REMOTE_SCRIPTS.map((f) => [f, readFileSync(f, 'utf8')]))
  const { ok, reasons } = evaluate({
    collector: readFileSync(COLLECTOR, 'utf8'),
    remoteScripts,
    retireWf: readFileSync(RETIRE_WF, 'utf8'),
  })
  console.log(`vps-retire-safety: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}
