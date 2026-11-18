// The content of an uploaded file as an object URL, for <img src> and links. GET /files/:id needs
// the Bearer token, so the file is fetched through the api client; the URL is revoked when the
// file changes or the component unmounts, and a download still running is aborted.
import { useEffect, useState } from 'react'
import { filesApi } from '@/api/files'

export interface FileObjectUrl {
  url: string | null
  error: unknown
  isLoading: boolean
}

const IDLE: FileObjectUrl = { url: null, error: null, isLoading: false }
const LOADING: FileObjectUrl = { url: null, error: null, isLoading: true }

export function useFileObjectUrl(fileId: string | null | undefined): FileObjectUrl {
  // The outcome of the latest download, for the file it belongs to
  const [loaded, setLoaded] = useState<{ fileId: string; url: string | null; error: unknown } | null>(null)

  useEffect(() => {
    if (!fileId) return
    const controller = new AbortController()
    let objectUrl: string | null = null

    filesApi.download(fileId, controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ fileId, url: objectUrl, error: null })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ fileId, url: null, error })
      },
    )

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])

  if (!fileId) return IDLE
  if (loaded?.fileId !== fileId) return LOADING
  return { url: loaded.url, error: loaded.error, isLoading: false }
}
