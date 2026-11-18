import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FILE_PURPOSES, MAX_UPLOAD_BYTES, filesApi, saveFile, uploadProblem } from './files'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

// Web/backend/src/files/files.service.ts FileView
const stored = { id: '9d8f7a6b-1c2d-4e5f-8a9b-0c1d2e3f4a5b', url: '/api/v1/mms_core/files/9d8f7a6b-1c2d-4e5f-8a9b-0c1d2e3f4a5b', name: 'bien-ban.pdf', mimeType: 'application/pdf', size: 1024 }

function fileOf(name: string, type: string, size = 10): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('filesApi', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('uploads the file as multipart with its purpose and returns the stored file', async () => {
    api.post.mockResolvedValue({ data: stored })
    const file = fileOf('bien-ban.pdf', 'application/pdf')

    await expect(filesApi.upload(file, 'official_document')).resolves.toEqual(stored)

    const [url, body, config] = api.post.mock.calls[0]
    expect(url).toBe('/files/upload')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toBe(file)
    expect((body as FormData).get('purpose')).toBe('official_document')
    // The client's JSON default would make axios serialise FormData as JSON
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('leaves the purpose out when none is given', async () => {
    api.post.mockResolvedValue({ data: stored })
    await filesApi.upload(fileOf('anh.png', 'image/png'))
    expect((api.post.mock.calls[0][1] as FormData).has('purpose')).toBe(false)
  })

  it('downloads the content through the authenticated client as a blob', async () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' })
    api.get.mockResolvedValue({ data: blob })
    const controller = new AbortController()

    await expect(filesApi.download(stored.id, controller.signal)).resolves.toBe(blob)
    expect(api.get).toHaveBeenCalledWith(`/files/${stored.id}`, { responseType: 'blob', signal: controller.signal })
  })
})

describe('FILE_PURPOSES', () => {
  // Web/backend/src/files/files.service.ts FILE_PURPOSES (T29 adds task and militia_profile)
  it('lists every purpose POST /files/upload accepts', () => {
    expect(FILE_PURPOSES).toEqual(['general', 'task_report', 'work_report', 'official_document', 'task', 'militia_profile'])
  })

  it.each(['task', 'militia_profile'] as const)('uploads a file for %s', async (purpose) => {
    api.post.mockReset()
    api.post.mockResolvedValue({ data: stored })
    await filesApi.upload(fileOf('anh.png', 'image/png'), purpose)
    expect((api.post.mock.calls[0][1] as FormData).get('purpose')).toBe(purpose)
  })
})

describe('uploadProblem', () => {
  it.each([
    ['image/jpeg', 'anh.jpg'],
    ['image/png', 'anh.png'],
    ['image/webp', 'anh.webp'],
    ['image/gif', 'anh.gif'],
    ['application/pdf', 'van-ban.pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'van-ban.docx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'bang.xlsx'],
    // The browser may not know a type: the server decides from the content
    ['', 'khong-ro.pdf'],
  ])('accepts %s', (type, name) => {
    expect(uploadProblem(fileOf(name, type))).toBeNull()
  })

  it.each([
    ['image/heic', 'anh.heic'],
    ['application/zip', 'nen.zip'],
    ['text/html', 'trang.html'],
  ])('refuses %s, which the server does not accept', (type, name) => {
    expect(uploadProblem(fileOf(name, type))).toBe('file_type_not_allowed')
  })

  it('refuses an empty file and one over 10 MB', () => {
    expect(uploadProblem(fileOf('rong.pdf', 'application/pdf', 0))).toBe('file_empty')
    expect(uploadProblem(fileOf('lon.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1))).toBe('file_too_large')
    expect(uploadProblem(fileOf('vua.pdf', 'application/pdf', MAX_UPLOAD_BYTES))).toBeNull()
  })
})

describe('saveFile', () => {
  const createObjectURL = vi.fn(() => 'blob:mms/1')
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    api.get.mockReset()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  })
  afterEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })

  it('saves the downloaded content under the file name and frees the object URL', async () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' })
    api.get.mockResolvedValue({ data: blob })
    const clicks: { href: string; download: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download })
    })

    await saveFile(stored)

    expect(api.get).toHaveBeenCalledWith(`/files/${stored.id}`, { responseType: 'blob', signal: undefined })
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicks).toEqual([{ href: 'blob:mms/1', download: 'bien-ban.pdf' }])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mms/1')
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })

  it('passes a failed download on to the caller', async () => {
    const failure = { response: { status: 404, data: { message: 'file_not_found' } } }
    api.get.mockRejectedValue(failure)
    await expect(saveFile(stored)).rejects.toBe(failure)
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
