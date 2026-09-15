// Types for the ops-event severity guard, so the test that validates it
// typechecks under the ratchet. The guard itself is plain node built-ins.
export interface SeverityLiteral {
  /** The literal written, exactly as it appears in source. */
  value: string
  /** 1-indexed line of the `.from('ops_events')` anchor it belongs to. */
  line: number
}
export interface AllowedSeverities {
  /** Filename of the migration the set was parsed out of. */
  file: string
  /** The levels the live CHECK constraint accepts. NULL is separately legal. */
  allowed: string[]
}
/** Parses the allowed set out of the newest migration that states the CHECK. */
export function allowedFromMigrations(dir?: string): AllowedSeverities | null
/** Severity literals written to `ops_events` in one source file. */
export function severityLiteralsIn(src: string): SeverityLiteral[]
/** True for test fixtures, which reach no database. Never true for a writer. */
export function isFixture(path: string): boolean
