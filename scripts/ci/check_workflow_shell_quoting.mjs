// SQL THAT THE SHELL READS FIRST IS NOT THE SQL YOU WROTE.
//
// ⚠️ THIS IS A MEASURED DEFECT, TWICE IN ONE SESSION. A staging assertion block
// is passed to psql as a single shell DOUBLE-QUOTED argument:
//
//     psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -q -c "
//       do $$ ... $$
//     "
//
// Inside that argument the shell still owns two characters. A backtick opens
// command substitution, so a SQL comment reading `-- the content pass's
// `profile` column` ran `profile` as a command and the step died with
// "asymmetric: command not found" — an error naming neither SQL nor the file.
// A bare double quote ENDS the argument early, so everything after it becomes
// stray words on the psql command line and the assertions that follow silently
// never run.
//
// ⚖️ AND THE SECOND TIME WAS INSIDE THE COMMENT EXPLAINING THE FIRST. That is
// what makes this a guard rather than a lesson: the region is prose-heavy, the
// characters are invisible to a reviewer reading SQL, and the failure names
// something unrelated. Escaped forms are fine and the real file uses them —
// \` and \" reach psql as themselves.
//
// ⚠️ AND HEREDOCS ARE THE SAME HAZARD WITH A DIFFERENT SPELLING. `<<EOF` expands
// the body; `<<'EOF'` does not. Every remote-shell block in this repo already
// quotes its delimiter, and this guard holds that line.
//
//   node scripts/ci/check_workflow_shell_quoting.mjs
//   node scripts/ci/check_workflow_shell_quoting.mjs --selftest
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

/**
 * ⚠️ AN EXPANDING HEREDOC MUST SAY WHY IT EXPANDS. Interpolation is sometimes
 * genuinely wanted, but silence cannot be how that choice gets made — the same
 * discipline NO_DEDICATED_SCHEMA follows. Key is `file:delimiter`.
 */
export const ALLOWED_EXPANDING_HEREDOCS = Object.freeze({})

/** Scan one shell string, tracking backslash escapes. */
function scanQuoted(text, start) {
  let i = start
  const backticks = []
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') { i += 2; continue }
    if (c === '`') backticks.push(i)
    if (c === '"') return { end: i, backticks }
    i++
  }
  return { end: -1, backticks }
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length

/**
 * Find every `-c "` argument in a workflow and report what the shell would do
 * to it before psql ever saw it.
 *
 * ⚖️ THE FIRST UNESCAPED QUOTE IS THE TERMINATOR — that is not a heuristic, it
 * is what the shell does. What IS a judgement is whether that terminator was
 * intended: a real one ends the argument, so nothing but whitespace or a shell
 * operator follows it on its line. Anything else means the argument ended in
 * the middle of a sentence.
 */
export function checkQuoting(text, file = 'workflow') {
  const problems = []
  const re = /-c\s+"/g
  let m
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1
    const { end, backticks } = scanQuoted(text, open + 1)
    if (end === -1) {
      problems.push(`${file}:${lineOf(text, open)}: -c " argument is never closed`)
      continue
    }
    for (const b of backticks) {
      problems.push(`${file}:${lineOf(text, b)}: unescaped backtick inside a -c " argument — `
        + 'the shell runs what follows as a command before psql sees it. Write \\` or drop it.')
    }
    // ⚠️ ONLY FOR A BLOCK THAT SPANS LINES. A single-line `-c "..."` is followed
    // by ordinary further arguments — `"$f"`, `2>/dev/null || true` — and reading
    // those as a premature terminator flagged four healthy commands the first
    // time this guard ran. The hazard is the prose-heavy multi-line SQL block,
    // where a stray quote is invisible and silently truncates the checks below.
    const spansLines = text.slice(open, end).includes('\n')
    const nl = text.indexOf('\n', end + 1)
    const rest = text.slice(end + 1, nl < 0 ? text.length : nl)
    if (spansLines && rest.trim() !== '') {
      problems.push(`${file}:${lineOf(text, end)}: this " ends the -c argument mid-sentence `
        + `(followed by "${rest.trim().slice(0, 40)}"). Everything after it becomes stray `
        + 'words on the command line and the checks below it never run. Write \\" .')
    }
    re.lastIndex = end + 1
  }
  return problems
}

/** ⚠️ `<<'EOF'` IS INERT; `<<EOF` IS EVALUATED. Same hazard, quieter spelling. */
export function checkHeredocs(text, file = 'workflow', allowed = ALLOWED_EXPANDING_HEREDOCS) {
  const problems = []
  const re = /<<-?\s*(['"\\]?)([A-Za-z_][A-Za-z0-9_]*)/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== '') continue
    const key = `${file}:${m[2]}`
    if (key in allowed) continue
    problems.push(`${file}:${lineOf(text, m.index)}: heredoc <<${m[2]} is UNQUOTED, so the body `
      + `is expanded and command-substituted. Write <<'${m[2]}', or record ${key} in `
      + 'ALLOWED_EXPANDING_HEREDOCS with the reason it must interpolate.')
  }
  return problems
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const cases = [
    ['the real backtick bug FAILS',
      'psql -c "\n  -- the content pass\'s `profile` column\n"\n', 'backtick'],
    ['an ESCAPED backtick passes — the real file uses them',
      'psql -c "\n  -- the content pass \\`profile\\` column\n"\n', null],
    ['a premature double quote FAILS',
      'psql -c "\n  -- a "quoted" word here\n"\n', 'mid-sentence'],
    ['an escaped double quote passes',
      'psql -c "\n  raise exception \\"x\\";\n"\n', null],
    ['dollar-quoting passes untouched', 'psql -c "\n  do \\$\\$ begin end \\$\\$\n"\n', null],
    ['an unterminated argument FAILS', 'psql -c "\n  select 1\n', 'never closed'],
    ['a terminator followed by a shell operator passes', 'psql -c "select 1" ;\n', null],
    // ⚠️ THE FOUR HEALTHY COMMANDS THIS GUARD FLAGGED ON ITS FIRST REAL RUN.
    ['a single-line -c with a following argument passes',
      'want=$(python3 -c "import json;print(1)" "$f")\n', null],
    ['a single-line -c with a redirection passes',
      'C=$(python -c "import json;print(1)" 2>/dev/null || true)\n', null],
  ]
  for (const [name, text, want] of cases) {
    const got = checkQuoting(text, 'f')
    const ok = want === null ? got.length === 0 : got.some((p) => p.includes(want))
    if (!ok) { console.error(`selftest: ${name} — got ${JSON.stringify(got)}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  const hd = [
    ['an unquoted heredoc FAILS', 'bash -s <<REMOTE\n', true],
    ['a quoted heredoc passes', "bash -s <<'REMOTE'\n", false],
    ['a dash-quoted heredoc passes', "bash -s <<-'REMOTE'\n", false],
  ]
  for (const [name, text, expectFail] of hd) {
    const got = checkHeredocs(text, 'f').length > 0
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('workflow-shell-quoting selftest: all cases passed')
  process.exit(0)
}

const dir = join(REPO, '.github', 'workflows')
const problems = []
for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
  const text = readFileSync(join(dir, f), 'utf8')
  problems.push(...checkQuoting(text, f), ...checkHeredocs(text, f))
}
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`)
  process.exit(1)
}
console.log('workflow-shell-quoting guard: OK')
