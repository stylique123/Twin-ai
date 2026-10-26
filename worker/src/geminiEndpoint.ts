// The worker's door to the Gemini backend helper (developer | vertex). Every
// Gemini call in the worker builds its request through here; see
// packages/shared/src/geminiBackend.ts for the env contract.
import type { EnvGet } from './generated/geminiBackend.js'
export {
  geminiBackend, geminiApiKey, geminiGenerateRequest, geminiEmbedRequest, readEmbedding, geminiModelOfUrl,
} from './generated/geminiBackend.js'

/** Read at call time, so a test (or a re-created container) sees the current env. */
export const workerEnv: EnvGet = (name) => process.env[name]
