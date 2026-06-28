import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { initApi } from '@twinai/shared'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anon)

// Mobile client: persist the session in AsyncStorage (not browser localStorage),
// and don't try to read the session from a URL (that's a web-only flow).
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anon ?? 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

// Wire the mobile platform into the shared API layer (@twinai/shared/api).
// uploadTake reads the recorded file URI and uploads its bytes to the `takes`
// bucket (RN has no Blob-from-disk; fetch(uri).arrayBuffer() is the RN pattern).
initApi({
  client: supabase,
  appOrigin: 'https://app.twinai.com',
  uploadTake: async (path, file) => {
    if (!file.uri) throw new Error('No file URI to upload')
    // Stream the file from disk via FormData. RN's network layer reads the uri
    // directly, so the whole video is never materialized in the JS heap — avoids
    // the OOM/crash risk of fetch(uri).arrayBuffer() on large (50–200MB) takes.
    const contentType = file.contentType || 'video/mp4'
    const form = new FormData()
    form.append('file', {
      uri: file.uri,
      name: file.name || path.split('/').pop() || 'take.mp4',
      type: contentType,
      // RN's FormData file part is not a DOM Blob; cast to satisfy the web typings.
    } as unknown as Blob)
    const { error } = await supabase.storage
      .from('takes')
      .upload(path, form, { contentType, upsert: true })
    if (error) throw error
  },
})
