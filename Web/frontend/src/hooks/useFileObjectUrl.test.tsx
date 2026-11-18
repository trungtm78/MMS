import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFileObjectUrl } from './useFileObjectUrl'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

const FILE_A = '11111111-1111-4111-8111-111111111111'
const FILE_B = '22222222-2222-4222-8222-222222222222'

describe('useFileObjectUrl', () => {
  let next = 0
  const createObjectURL = vi.fn(() => `blob:mms/${++next}`)
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    next = 0
    api.get.mockReset()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  })

  it('fetches the file with the signed-in client and exposes an object URL', async () => {
    const blob = new Blob(['img'], { type: 'image/png' })
    api.get.mockResolvedValue({ data: blob })

    const { result } = renderHook(() => useFileObjectUrl(FILE_A))
    expect(result.current).toEqual({ url: null, error: null, isLoading: true })

    await waitFor(() => expect(result.current).toEqual({ url: 'blob:mms/1', error: null, isLoading: false }))
    expect(api.get).toHaveBeenCalledWith(`/files/${FILE_A}`, expect.objectContaining({ responseType: 'blob' }))
    expect(createObjectURL).toHaveBeenCalledWith(blob)
  })

  it('revokes the object URL when the component unmounts', async () => {
    api.get.mockResolvedValue({ data: new Blob(['a']) })
    const { result, unmount } = renderHook(() => useFileObjectUrl(FILE_A))
    await waitFor(() => expect(result.current.url).toBe('blob:mms/1'))

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mms/1')
  })

  it('replaces and revokes the previous URL when the file changes', async () => {
    api.get.mockResolvedValue({ data: new Blob(['a']) })
    const { result, rerender } = renderHook(({ id }) => useFileObjectUrl(id), { initialProps: { id: FILE_A } })
    await waitFor(() => expect(result.current.url).toBe('blob:mms/1'))

    rerender({ id: FILE_B })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mms/1')
    await waitFor(() => expect(result.current.url).toBe('blob:mms/2'))
    expect(api.get).toHaveBeenLastCalledWith(`/files/${FILE_B}`, expect.objectContaining({ responseType: 'blob' }))
  })

  it('aborts a download that is still running when the component unmounts', async () => {
    let signal: AbortSignal | undefined
    api.get.mockImplementation((_url: string, config: { signal: AbortSignal }) => {
      signal = config.signal
      return new Promise(() => {})
    })
    const { unmount } = renderHook(() => useFileObjectUrl(FILE_A))
    await waitFor(() => expect(signal).toBeDefined())

    unmount()
    expect(signal?.aborted).toBe(true)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('reports a failed download', async () => {
    const failure = { response: { status: 404, data: { message: 'file_not_found' } } }
    api.get.mockRejectedValue(failure)
    const { result } = renderHook(() => useFileObjectUrl(FILE_A))

    await waitFor(() => expect(result.current).toEqual({ url: null, error: failure, isLoading: false }))
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('does nothing without a file id', () => {
    const { result } = renderHook(() => useFileObjectUrl(null))
    expect(result.current).toEqual({ url: null, error: null, isLoading: false })
    expect(api.get).not.toHaveBeenCalled()
  })
})
