import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'
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
  uploadTake: async (path, file, onProgress) => {
    if (!file.uri) throw new Error('No file URI to upload')
    const contentType = file.contentType || 'video/mp4'
    const name = file.name || path.split('/').pop() || 'take.mp4'

    // Preferred path: stream the file from disk to a signed upload URL via
    // expo-file-system. It reports byte progress and never buffers the whole
    // video in the JS heap, so large (50–200MB) takes won't OOM the device.
    try {
      const { data: signed, error: signErr } = await supabase.storage.from('takes').createSignedUploadUrl(path)
      if (signErr || !signed?.signedUrl) throw signErr || new Error('No signed upload URL')
      const putUrl = `${url}/storage/v1${signed.signedUrl}`
      const task = FileSystem.createUploadTask(
        putUrl,
        file.uri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'content-type': contentType, 'x-upsert': 'true' },
        },
        (p) => { if (p.totalBytesExpectedToSend > 0) onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend) },
      )
      const res = await task.uploadAsync()
      if (!res || res.status >= 300) throw new Error(`Upload failed (${res?.status ?? 'no response'})`)
    } catch {
      // Fallback: supabase-js multipart upload (also streams from disk via
      // FormData, just without progress). Keeps takes uploadable if the signed
      // PUT path is unavailable.
      onProgress?.(-1)
      const form = new FormData()
      form.append('file', { uri: file.uri, name, type: contentType } as unknown as Blob)
      const { error } = await supabase.storage.from('takes').upload(path, form, { contentType, upsert: true })
      if (error) throw error
    }
  },
})
