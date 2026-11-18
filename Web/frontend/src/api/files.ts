// Uploaded files — Web/backend/src/files. An upload returns the stored file; the id is what task
// reports (photoIds), work reports (attachmentIds) and official documents (fileId) accept, and
// the upload's purpose must match the record it is attached to. GET /files/:id needs the Bearer
// token, so screens fetch the content through this client as a blob (see useFileObjectUrl).
import client from './client'
import { withJsonErrorBody } from '@/lib/api-error'

// files.service.ts FILE_PURPOSES: general plus every record kind a file can be attached to
export const FILE_PURPOSES = ['general', 'task_report', 'work_report', 'official_document', 'task', 'militia_profile'] as const
export type FilePurpose = (typeof FILE_PURPOSES)[number]

/** files.service.ts FileView — `url` is the API path of the content, global prefix included */
export interface StoredFile {
  id: string
  url: string
  name: string
  mimeType: string
  size: number
}

// upload-type.ts ALLOWED_UPLOAD_TYPES: the server decides by the content (HEIC is refused)
export const ALLOWED_UPLOAD_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
/** For <input type="file" accept> */
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_TYPES.join(',')
export const IMAGE_UPLOAD_ACCEPT = ALLOWED_UPLOAD_TYPES.filter((type) => type.startsWith('image/')).join(',')
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** The upload error codes a file can be refused with before it is sent (errors.files.upload.*) */
export type UploadProblem = 'file_empty' | 'file_too_large' | 'file_type_not_allowed'

/** Why the server would refuse this file, or null. A type the browser does not know is left to the server. */
export function uploadProblem(file: File): UploadProblem | null {
  if (file.size === 0) return 'file_empty'
  if (file.size > MAX_UPLOAD_BYTES) return 'file_too_large'
  if (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type)) return 'file_type_not_allowed'
  return null
}

export const filesApi = {
  // POST /files/upload (multipart: file, purpose?) → 201 StoredFile
  upload: async (file: File, purpose?: FilePurpose): Promise<StoredFile> => {
    const body = new FormData()
    body.append('file', file)
    if (purpose) body.append('purpose', purpose)
    // The client defaults to JSON, which would make axios serialise the FormData as JSON;
    // with this header the browser sends multipart and adds the boundary itself
    const response = await client.post<StoredFile>('/files/upload', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // GET /files/:id → the content; 404 file_not_found without access
  download: async (id: string, signal?: AbortSignal): Promise<Blob> => {
    try {
      const response = await client.get<Blob>(`/files/${id}`, { responseType: 'blob', signal })
      return response.data
    } catch (err) {
      // The JSON error body arrives as a Blob too: decode it so the code can be read
      throw await withJsonErrorBody(err)
    }
  },
}

/** Downloads a stored file with the signed-in client and saves it under its name. */
export async function saveFile(file: Pick<StoredFile, 'id' | 'name'>): Promise<void> {
  const blob = await filesApi.download(file.id)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
