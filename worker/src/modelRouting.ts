// THE ONE LOADER for per-task model routing (§2.4).
//
// Every model choice in the worker resolves through `modelForTask`. Nothing
// else may name a model: a second place that decides is how the twelve
// analysis-component allowlists happened, and how routing itself came to be
// decided three different ways before this file existed.
//
// LANDING THIS CHANGES NO MODEL FOR ANY TASK. model_routing_v1.json encodes
// what each task already used, so the default path resolves to exactly the id
// it resolved to before — the same safety property that made wiring `pacing`
// safe. Only a deliberate catalog edit moves a model after this.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export interface TaskClassRouting {
  model: string
  /** Env var permitted to override, or null when the model is FROZEN. */
  envOverride: string | null
}
export interface ModelRouting {
  routingVersion: string
  taskClasses: Record<string, TaskClassRouting>
}

let cached: ModelRouting | null = null

export function loadModelRouting(path = join(WORKER_ROOT, 'model_routing_v1.json')): ModelRouting {
  if (cached) return cached
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  for (const k of Object.keys(raw)) if (k.startsWith('$')) delete raw[k]
  const classes = (raw.taskClasses ?? {}) as Record<string, Record<string, unknown>>
  for (const c of Object.values(classes)) for (const k of Object.keys(c)) if (k.startsWith('$')) delete c[k]
  cached = raw as unknown as ModelRouting
  return cached
}
export function resetModelRoutingCacheForTests(): void { cached = null }

/**
 * Resolve the model id for a task class.
 *
 * AN UNKNOWN TASK CLASS THROWS. It must not fall back to some default model:
 * a silent fallback is how a task ends up on a model nobody chose, and the
 * recorded provenance would then name a model that no catalog entry explains.
 * Failing here is loud, immediate, and points at the missing entry.
 *
 * A FROZEN CLASS IGNORES THE ENVIRONMENT ENTIRELY. `envOverride: null` means
 * the recorded model must be reproducible from the catalog alone — which is
 * what makes a Director decision replayable from its bundle. Reading env for
 * such a class would make the record unreproducible in exactly the way the
 * pinning exists to prevent.
 */
export function modelForTask(
  taskClass: string,
  routing: ModelRouting = loadModelRouting(),
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const entry = routing.taskClasses?.[taskClass]
  if (!entry) {
    throw new Error(
      `model routing: unknown task class '${taskClass}'. Add it to model_routing_v1.json — ` +
      `there is deliberately no default, because a task silently landing on some other ` +
      `task's model is the failure this catalog exists to prevent.`)
  }
  if (entry.envOverride === null) return entry.model
  const override = (environment[entry.envOverride] ?? '').trim()
  return override === '' ? entry.model : override
}

/** Declared class ids, for guards and tests. */
export function taskClassIds(routing: ModelRouting = loadModelRouting()): string[] {
  return Object.keys(routing.taskClasses ?? {})
}
