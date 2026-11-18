// Test helper: the real i18next instance with the Vietnamese resources, so components under test
// render the texts users see. Imported by src/test/setup.ts for every test file.
import i18n from '@/i18n'

export { i18n }

/** Reads a text by key, for tests that want to name the key rather than repeat the text */
export const t = i18n.t.bind(i18n)

/** A key missing from the resources fails the test instead of rendering the key itself */
export function failOnMissingTranslations(): void {
  i18n.options.saveMissing = true
  i18n.on('missingKey', (_languages: readonly string[], _namespace: string, key: string) => {
    throw new Error(`Missing translation key: ${key}`)
  })
}
