// @twinai/shared — code used by the web app (Vercel): data types, brand/pricing
// constants, the Recording Script, and the backend API layer (client-agnostic;
// call initApi() once at app startup). Kept as its own package so the API and
// domain logic stay decoupled from the React/Vite app that consumes them.
export * from './types'
export * from './brand'
export * from './recordingScript'
export * from './recordingScriptAdapter'
export * from './recordingScriptApi'
export * from './api'
export * from './capture'
export * from './editor/index'
