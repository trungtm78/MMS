import type { ParseKeys } from 'i18next'
import type errors from './locales/vi/errors.json'

/** Any key of the Vietnamese resources */
export type TranslationKey = ParseKeys

type ScopePaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? never : `${Prefix}${K}` | ScopePaths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

/** A group of backend error codes in the error table: errors.<scope>.<code> */
export type ErrorScope = Exclude<ScopePaths<typeof errors>, 'common'>
