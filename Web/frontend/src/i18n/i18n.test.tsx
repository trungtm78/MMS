import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { resources } from './resources'
import type { TranslationKey } from './types'

describe('i18n', () => {
  it('starts synchronously with Vietnamese as the only language', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.language).toBe('vi')
    expect(i18n.options.supportedLngs).toEqual(['vi', 'cimode'])
    expect(i18n.t('common.actions.cancel')).toBe('Hủy')
  })

  it('renders the real texts in components under test', () => {
    function Probe() {
      const { t } = useTranslation()
      return <button type="button">{t('common.actions.close')}</button>
    }
    render(<Probe />)
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
  })

  it('interpolates values', () => {
    expect(i18n.t('errors.common.validationDetails', { details: 'reason should not be empty' })).toBe(
      'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (reason should not be empty)',
    )
  })

  // src/test/i18n.ts turns a key missing from the resources into a failed test
  it('fails loudly on a key that is not in the resources', () => {
    const missing: string = 'common.actions.doesNotExist'
    expect(() => i18n.t(missing as TranslationKey)).toThrow('Missing translation key: common.actions.doesNotExist')
  })

  it('registers every locale file under its module name', () => {
    const files = Object.keys(import.meta.glob('./locales/vi/*.json'))
    const modules = files.map((file) => file.replace('./locales/vi/', '').replace('.json', '')).sort()
    expect(Object.keys(resources.vi.translation).sort()).toEqual(modules)
  })
})
