// Typed resources: a key that is not in the Vietnamese locale files fails `tsc`
import 'i18next'
import type { defaultNS, resources } from './resources'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['vi']
    returnNull: false
  }
}
