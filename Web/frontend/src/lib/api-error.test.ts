import { describe, it, expect, vi } from 'vitest'
import {
  describeApiError,
  errorCodeText,
  isClientError,
  mapValidationErrors,
  parseApiError,
  retryUnlessClientError,
  skipRetryOnClientError,
} from './api-error'

// Shape axios rejects with for an HTTP error answered by the backend HttpExceptionFilter:
// { code: 'E00x', message: <machine code>, statusCode, timestamp, path }
function httpError(status: number, message?: unknown, extra: Record<string, unknown> = {}) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    request: {},
    response: { status, data: { code: 'E004', message, statusCode: status, ...extra } },
  }
}

// ValidationPipe failure: { code: 'E001', message: 'validation_failed', errors: [...] }
function validationError(errors: unknown) {
  return httpError(400, 'validation_failed', { code: 'E001', errors })
}

describe('parseApiError', () => {
  it('reads the HTTP status and the backend error code from the response body', () => {
    expect(parseApiError(httpError(403, 'account_disabled'))).toEqual({
      status: 403,
      code: 'account_disabled',
      isNetworkError: false,
      validationErrors: [],
      details: null,
    })
  })

  // { code, message: 'invalid_code', details: { attemptsRemaining }, statusCode } (mfa.service.ts rejectCode)
  it('reads the structured details of an application error', () => {
    const info = parseApiError(httpError(401, 'invalid_code', { details: { attemptsRemaining: 3 } }))
    expect(info.code).toBe('invalid_code')
    expect(info.details).toEqual({ attemptsRemaining: 3 })
  })

  it('ignores details that are not an object', () => {
    expect(parseApiError(httpError(401, 'invalid_code', { details: [3] })).details).toBeNull()
    expect(parseApiError(httpError(401, 'invalid_code', { details: 'three' })).details).toBeNull()
  })

  it('ignores a message that is not a string', () => {
    expect(parseApiError(httpError(400, ['username must be a string'])).code).toBeNull()
  })

  it('reads the validation messages of a validation_failed answer', () => {
    const info = parseApiError(validationError(['fromDate must be YYYY-MM-DD', 42, 'reason should not be empty']))
    expect(info.code).toBe('validation_failed')
    expect(info.validationErrors).toEqual(['fromDate must be YYYY-MM-DD', 'reason should not be empty'])
  })

  it('flags a request that never got a response as a network error', () => {
    const err = { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error', request: {} }
    expect(parseApiError(err)).toEqual({ status: null, code: null, isNetworkError: true, validationErrors: [], details: null })
  })

  it('treats a timed-out request as a network error', () => {
    const err = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded', request: {} }
    expect(parseApiError(err).isNetworkError).toBe(true)
  })

  it('does not treat an ordinary exception as a network error', () => {
    expect(parseApiError(new Error('boom'))).toEqual({ status: null, code: null, isNetworkError: false, validationErrors: [], details: null })
    expect(parseApiError(undefined)).toEqual({ status: null, code: null, isNetworkError: false, validationErrors: [], details: null })
  })
})

// Backend codes are read from the one error table, src/i18n/locales/vi/errors.json
describe('describeApiError', () => {
  const options = {
    scope: 'admin',
    statuses: { 429: 'errors.common.throttled' },
    fallback: 'errors.common.unexpected',
  } as const

  it('gives the text the error table holds for the code in the scope', () => {
    expect(describeApiError(httpError(409, 'username_taken'), options)).toBe('Tên đăng nhập đã được sử dụng')
  })

  it('looks through several scopes in order', () => {
    const scope = ['leave.cancel', 'leave.review'] as const
    expect(describeApiError(httpError(404, 'leave_request_not_found'), { scope, fallback: 'errors.common.unexpected' })).toBe(
      'Không tìm thấy đơn nghỉ phép.',
    )
    expect(describeApiError(httpError(409, 'insufficient_leave_balance'), { scope, fallback: 'errors.common.unexpected' })).toBe(
      'Người đề nghị không còn đủ số ngày phép để duyệt đơn này.',
    )
  })

  it('does not take the text of a code from another scope', () => {
    expect(describeApiError(httpError(409, 'username_taken'), { scope: 'leave.cancel', fallback: 'errors.common.unexpected' })).toBe(
      'Đã có lỗi xảy ra. Vui lòng thử lại.',
    )
  })

  it('uses the status text when the code is not in the table (429 answers with code E006)', () => {
    const throttled = httpError(429, 'ThrottlerException: Too Many Requests', { code: 'E006' })
    expect(describeApiError(throttled, options)).toBe('Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.')
  })

  it('falls back when neither the code nor the status is mapped', () => {
    expect(describeApiError(httpError(500, 'Internal server error'), options)).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.')
  })

  it('lists the validation messages of a validation_failed answer', () => {
    const err = validationError(['title should not be empty', 'deadline must be a valid ISO 8601 date string'])
    expect(describeApiError(err, options)).toBe(
      'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (title should not be empty; deadline must be a valid ISO 8601 date string)',
    )
  })

  it('explains a network failure', () => {
    const err = { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error', request: {} }
    expect(describeApiError(err, options)).toBe('Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.')
  })
})

describe('errorCodeText', () => {
  it('reads a code of a scope from the error table', () => {
    expect(errorCodeText('auth.mfa', 'mfa_locked')).toBe(
      'Xác thực hai lớp đang tạm khóa 15 phút do nhập sai mã nhiều lần. Vui lòng thử lại sau.',
    )
  })

  it('interpolates values into the text', () => {
    expect(errorCodeText('chat', 'message_too_long', { max: 4000 })).toBe('Tin nhắn không được vượt quá 4000 ký tự')
  })

  it('returns null for a code the scope does not hold', () => {
    expect(errorCodeText('auth.mfa', 'username_taken')).toBeNull()
    expect(errorCodeText('auth.mfa', '')).toBeNull()
  })
})

describe('mapValidationErrors', () => {
  const fields = {
    fromDate: ['fromDate', 'from_date'],
    reason: ['reason'],
    replacementId: ['replacementId'],
  } as const

  it('puts each message next to the field it names, including snake_case aliases', () => {
    const result = mapValidationErrors(
      validationError(['from_date must be YYYY-MM-DD', 'reason should not be empty', 'reason must be a string']),
      fields,
    )
    expect(result).toEqual({
      fieldErrors: {
        fromDate: 'from_date must be YYYY-MM-DD',
        reason: 'reason should not be empty; reason must be a string',
      },
      otherErrors: [],
    })
  })

  it('keeps messages that name no form field for a generic message', () => {
    const result = mapValidationErrors(
      validationError(['property leaveType should not exist', 'each value in documents must be a string']),
      fields,
    )
    expect(result).toEqual({
      fieldErrors: {},
      otherErrors: ['property leaveType should not exist', 'each value in documents must be a string'],
    })
  })

  it('does not match a field whose name is only a prefix of another property', () => {
    const result = mapValidationErrors(validationError(['reasonCode must be a string']), fields)
    expect(result?.fieldErrors).toEqual({})
    expect(result?.otherErrors).toEqual(['reasonCode must be a string'])
  })

  it('returns null for errors that are not validation failures', () => {
    expect(mapValidationErrors(httpError(409, 'insufficient_leave_balance'), fields)).toBeNull()
    expect(mapValidationErrors(new Error('boom'), fields)).toBeNull()
  })
})

describe('retry policy', () => {
  it('recognises 4xx answers as client errors', () => {
    expect(isClientError(httpError(404, 'militia_not_found'))).toBe(true)
    expect(isClientError(httpError(503))).toBe(false)
    expect(isClientError(new Error('boom'))).toBe(false)
  })

  it('never retries a client error, since the answer will not change', () => {
    expect(retryUnlessClientError(0, httpError(403, 'unit_scope_violation'))).toBe(false)
  })

  it('retries server and network failures up to three times', () => {
    const err = httpError(502)
    expect(retryUnlessClientError(0, err)).toBe(true)
    expect(retryUnlessClientError(2, err)).toBe(true)
    expect(retryUnlessClientError(3, err)).toBe(false)
  })
})

describe('skipRetryOnClientError', () => {
  const serverError = httpError(503)
  const refusal = httpError(404, 'militia_not_found')

  it('never retries a client error, whatever the base policy', () => {
    expect(skipRetryOnClientError(true)(0, refusal)).toBe(false)
    expect(skipRetryOnClientError(5)(0, refusal)).toBe(false)
    expect(skipRetryOnClientError(() => true)(0, refusal)).toBe(false)
  })

  it('keeps a numeric base policy for other failures', () => {
    expect(skipRetryOnClientError(1)(0, serverError)).toBe(true)
    expect(skipRetryOnClientError(1)(1, serverError)).toBe(false)
  })

  it('keeps a boolean base policy for other failures', () => {
    expect(skipRetryOnClientError(false)(0, serverError)).toBe(false)
    expect(skipRetryOnClientError(true)(7, serverError)).toBe(true)
  })

  it('delegates to a function base policy for other failures', () => {
    const base = vi.fn((count: number) => count < 2)
    expect(skipRetryOnClientError(base)(1, serverError)).toBe(true)
    expect(base).toHaveBeenCalledWith(1, serverError)
  })

  it('uses the TanStack Query default of three retries without a base policy', () => {
    expect(skipRetryOnClientError(undefined)(2, serverError)).toBe(true)
    expect(skipRetryOnClientError(undefined)(3, serverError)).toBe(false)
  })
})
