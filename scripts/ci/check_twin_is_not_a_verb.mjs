#!/usr/bin/env node
// "TEACH YOUR TWIN" HAS BEEN REPORTED SIX TIMES AND KEPT COMING BACK.
//
// ⚠️ A RENAME WITH NOTHING HOLDING IT IS WHY THIS IS THE SIXTH FLAG. The label
// was changed before; it returned. A string a person can retype is not a
// decision until something fails when they do.
//
// ⚖️ WHAT THE PHRASE GETS WRONG, so the next person can disagree with the rule
// rather than guess at it: it addresses the creator as the twin's operator and
// makes "twin" a thing you perform maintenance on. The card asks the creator
// about their own work. It belongs to them — "My Twin" — and the copy rule
// everywhere a creator reads is plain everyday English.
//
// ⚖️ SOURCE ONLY, AND ONLY WHERE A CREATOR READS. This guard does not police
// comments or prose that merely DISCUSSES the old label — including the banner
// you are reading. It fails on the string appearing in rendered copy.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['apps/web/src']
const BANNED = /teach\s+your\s+twin/i

/** ⚠️ A WHOLE-LINE COMMENT IS DROPPED, NEVER "EVERYTHING AFTER //". Stripping
 *  from `//` onward deletes a real string sitting after a URL, and the guard
 *  silently stops catching the thing it exists for. This repo has been bitten
 *  by that four times. */
export function isCommentLine(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

export function offendingLines(src) {
  const out = []
  src.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return
    if (BANNED.test(line)) out.push({ line: i + 1, text: line.trim() })
  })
  return out
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(p)) acc.push(p)
  }
  return acc
}

function main() {
  const bad = []
  for (const root of ROOTS) {
    for (const f of walk(root)) {
      for (const hit of offendingLines(readFileSync(f, 'utf8'))) {
        bad.push(`${f}:${hit.line}  ${hit.text}`)
      }
    }
  }
  if (bad.length > 0) {
    console.error('FAIL a creator is told to "teach your twin". The twin is theirs:')
    for (const b of bad) console.error(`  ${b}`)
    console.error('Use "My Twin". See the banner in this file for why.')
    process.exit(1)
  }
  console.log('ok no creator-facing copy tells anyone to teach their twin')
}

if (process.argv.includes('--selftest')) {
  const checks = [
    ['catches the label in rendered copy', offendingLines('  <p>Teach your twin</p>').length === 1],
    ['case and spacing do not evade it', offendingLines('TEACH  YOUR  TWIN').length === 1],
    ['a whole-line comment discussing it is allowed', offendingLines('// "Teach your twin" was renamed').length === 0],
    ['a jsdoc line discussing it is allowed', offendingLines(' * Teach your twin -> My Twin').length === 0],
    ['the replacement passes', offendingLines('  <p>My Twin</p>').length === 0],
    ['a real string after a URL is NOT dropped', offendingLines('const a = "https://x.dev" // see\nconst b = "Teach your twin"').length === 1],
    ['reports the true line number', offendingLines('a\nb\nTeach your twin')[0].line === 3],
  ]
  let bad = 0
  for (const [n, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`); if (!ok) bad += 1 }
  console.log(`${checks.length - bad}/${checks.length}`)
  process.exit(bad === 0 ? 0 : 1)
} else main()
