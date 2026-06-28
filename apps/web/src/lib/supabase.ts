import { createClient } from '@supabase/supabase-js'
import { initApi } from '@twinai/shared'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Surface a clear error in dev rather than a cryptic runtime failure.
export const isSupabaseConfigured = Boolean(url && anon)

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anon ?? 'placeholder-anon-key',
)

// Wire the web platform into the shared API layer (used by @twinai/shared/api).
// Importing this module (done early via AuthContext) initializes it once.
initApi({
  client: supabase,
  appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  uploadTake: async (path, file) => {
    const { error } = await supabase.storage
      .from('takes')
      .upload(path, file.blob as Blob, { contentType: file.contentType || 'video/webm', upsert: true })
    if (error) throw error
  },
})
