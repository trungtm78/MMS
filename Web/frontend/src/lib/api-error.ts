// Reading backend errors. The NestJS HttpExceptionFilter answers every error with
// { code: 'E00x', message: <machine code>, statusCode, timestamp, path }; the machine code in
// `message` (e.g. 'account_disabled', 'leave_request_not_pending') is what screens translate.
// ValidationPipe failures answer { code: 'E001', message: 'validation_failed', errors: [...] },
// one class-validator message per failed constraint ("fromDate must be YYYY-MM-DD").
// Codes become texts through one table, src/i18n/locales/vi/errors.json (errors.<scope>.<code>).
import i18n from '@/i18n'
import type { ErrorScope, TranslationKey } from '@/i18n/types'

export interface ApiErrorInfo {
  /** HTTP status, or null when no response arrived */
  status: number | null
  /** Backend machine code from the response body, when it is a string */
  code: string | null
  /** The request was sent but no response came back (offline, DNS, CORS, timeout) */
  isNetworkError: boolean
  /** Messages of a validation_failed answer (empty otherwise) */
  validationErrors: string[]
  /** Structured data of an application error, e.g. { attemptsRemaining } for invalid_code */
  details: Record<string, unknown> | null
}

// axios error codes for requests that never got an HTTP answer
const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ERR_NETWORK',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNREFUSED',
])

export function parseApiError(err: unknown): ApiErrorInfo {
  if (typeof err !== 'object' || err === null) {
    return { status: null, code: null, isNetworkError: false, validationErrors: [], details: null }
  }
  const error = err as {
    response?: { status?: unknown; data?: unknown }
    request?: unknown
    code?: unknown
  }
  if (error.response && typeof error.response === 'object') {
    const { status, data } = error.response
    const body =
      typeof data === 'object' && data !== null
        ? (data as { message?: unknown; errors?: unknown; details?: unknown })
        : {}
    const { details } = body
    return {
      status: typeof status === 'number' ? status : null,
      code: typeof body.message === 'string' ? body.message : null,
      isNetworkError: false,
      validationErrors: Array.isArray(body.errors)
        ? body.errors.filter((e): e is string => typeof e === 'string')
        : [],
      details:
        typeof details === 'object' && details !== null && !Array.isArray(details)
          ? (details as Record<string, unknown>)
          : null,
    }
  }
  const isNetworkError =
    error.request !== undefined ||
    (typeof error.code === 'string' && NETWORK_ERROR_CODES.has(error.code))
  return { status: null, code: null, isNetworkError, validationErrors: [], details: null }
}

// Backend codes are snake_case machine words; anything else (e.g. "ThrottlerException: …") is not a key
const MACHINE_CODE = /^[a-z0-9_]+$/i

/**
 * The text the error table holds for `code` in `scope` (errors.<scope>.<code>), or null when the
 * scope has no entry for it. `values` fill the text's {{placeholders}}.
 */
export function errorCodeText(scope: ErrorScope, code: string, values?: Record<string, unknown>): string | null {
  if (!MACHINE_CODE.test(code)) return null
  const key = `errors.${scope}.${code}`
  if (typeof i18n.getResource(i18n.language, 'translation', key) !== 'string') return null
  return i18n.t(key as TranslationKey, { ...values })
}

export interface DescribeApiErrorOptions {
  /** Where the backend code is looked up in the error table, in order */
  scope?: ErrorScope | readonly ErrorScope[]
  /** HTTP status → text key, used when the code is not in the table */
  statuses?: Readonly<Partial<Record<number, TranslationKey>>>
  /** Text key when nothing else applies */
  fallback: TranslationKey
}

function validationSummary(messages: readonly string[]): string {
  return messages.length
    ? i18n.t('errors.common.validationDetails', { details: messages.join('; ') })
    : i18n.t('errors.common.validation')
}

/**
 * User-facing text for an API failure: network problem, then the code in the error table, then
 * the validation messages, then the status, then the fallback.
 */
export function describeApiError(err: unknown, { scope, statuses, fallback }: DescribeApiErrorOptions): string {
  const info = parseApiError(err)
  if (info.isNetworkError) return i18n.t('errors.common.network')
  if (info.code !== null) {
    const scopes: readonly ErrorScope[] = scope === undefined ? [] : typeof scope === 'string' ? [scope as ErrorScope] : scope
    for (const each of scopes) {
      const text = errorCodeText(each, info.code)
      if (text !== null) return text
    }
  }
  if (info.code === 'validation_failed') return validationSummary(info.validationErrors)
  const byStatus = info.status !== null ? statuses?.[info.status] : undefined
  return i18n.t(byStatus ?? fallback)
}

export interface ValidationErrorMap<F extends string> {
  /** Messages about one form field, joined when several constraints failed */
  fieldErrors: Partial<Record<F, string>>
  /** Messages that name no form field */
  otherErrors: string[]
}

/**
 * Sorts the messages of a validation_failed answer onto form fields. `fields` lists, per form
 * field, the property names the messages may use (class-validator prefixes each message with
 * the property, or with a custom name such as "from_date"). Returns null for any other error.
 */
export function mapValidationErrors<F extends string>(
  err: unknown,
  fields: Readonly<Record<F, readonly string[]>>,
): ValidationErrorMap<F> | null {
  const info = parseApiError(err)
  if (info.code !== 'validation_failed' || info.validationErrors.length === 0) return null

  const fieldErrors: Partial<Record<F, string>> = {}
  const otherErrors: string[] = []
  const entries = Object.entries(fields) as [F, readonly string[]][]
  for (const message of info.validationErrors) {
    const match = entries.find(([, names]) => names.some((name) => message.startsWith(`${name} `)))
    if (!match) {
      otherErrors.push(message)
      continue
    }
    const [field] = match
    fieldErrors[field] = fieldErrors[field] ? `${fieldErrors[field]}; ${message}` : message
  }
  return { fieldErrors, otherErrors }
}

/** The form-level text for messages that name no field (null when there are none) */
export function validationFormMessage(otherErrors: readonly string[]): string | null {
  return otherErrors.length ? validationSummary(otherErrors) : null
}

export function isClientError(err: unknown): boolean {
  const { status } = parseApiError(err)
  return status !== null && status >= 400 && status < 500
}

export const MAX_QUERY_RETRIES = 3

/** TanStack Query `retry`: a 4xx answer will not change on retry, anything else may. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  return !isClientError(error) && failureCount < MAX_QUERY_RETRIES
}

type RetryPolicy<TError> = boolean | number | ((failureCount: number, error: TError) => boolean) | undefined

/**
 * Wraps a retry policy (typically the QueryClient default) so 4xx answers are never retried
 * while every other failure keeps that policy. Undefined means the TanStack default of 3.
 */
export function skipRetryOnClientError<TError = unknown>(base: RetryPolicy<TError>) {
  return (failureCount: number, error: TError): boolean => {
    if (isClientError(error)) return false
    if (typeof base === 'function') return base(failureCount, error)
    if (typeof base === 'number') return failureCount < base
    if (typeof base === 'boolean') return base
    return failureCount < MAX_QUERY_RETRIES
  }
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

const NOT_JSON = Symbol('not-json')

/** The JSON a Blob holds, or NOT_JSON when it cannot be read or is not JSON (e.g. an HTML proxy page) */
async function blobJson(blob: Blob): Promise<unknown> {
  try {
    return JSON.parse(await readBlobText(blob)) as unknown
  } catch {
    return NOT_JSON
  }
}

/**
 * Requests made with responseType 'blob' receive the JSON error body as a Blob too. Decode it
 * in place so parseApiError/describeApiError can read the backend code; returns the error.
 * A body that is not JSON is left as it is.
 */
export async function withJsonErrorBody(err: unknown): Promise<unknown> {
  const response = (err as { response?: { data?: unknown } } | null)?.response
  if (!response || typeof Blob === 'undefined' || !(response.data instanceof Blob)) return err
  const body = await blobJson(response.data)
  if (body !== NOT_JSON) response.data = body
  return err
}
