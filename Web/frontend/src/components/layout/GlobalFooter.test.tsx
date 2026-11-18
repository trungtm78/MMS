import { describe, it, expect, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { i18n } from '@/test/i18n'
import { GlobalFooter } from './GlobalFooter'

// Replaces texts of the locale files for one test, to prove the footer reads them from there
const restoreTexts: (() => void)[] = []
function overrideText(key: string, value: string) {
  const previous: unknown = i18n.getResource('vi', 'translation', key)
  i18n.addResource('vi', 'translation', key, value)
  restoreTexts.push(() => {
    if (typeof previous === 'string') i18n.addResource('vi', 'translation', key, previous)
  })
}

describe('GlobalFooter', () => {
  afterEach(() => {
    for (const restore of restoreTexts.splice(0).reverse()) restore()
  })

  it('names the ward authority and its address, phone and regulation', () => {
    render(<GlobalFooter />)
    const footer = screen.getByRole('contentinfo')

    expect(screen.getByRole('heading', { name: 'ỦY BAN NHÂN DÂN PHƯỜNG PHÚ ĐỊNH' })).toBeInTheDocument()
    expect(footer).toHaveTextContent('Địa chỉ: Số 184 đường Lưu Hữu Phước, phường Phú Định, TP.HCM')
    expect(footer).toHaveTextContent('Điện thoại: 0283. 5359502')
    expect(footer).toHaveTextContent(
      '"Quý chế quản lý, vận hành và khai thác Hệ thống quản lý Lực lượng bảo vệ an ninh trật tự"',
    )
  })

  it('links the email, fanpage and Zalo Official account', () => {
    render(<GlobalFooter />)
    const footer = screen.getByRole('contentinfo')

    expect(footer).toHaveTextContent('Email: phudinh@tphcm.gov.vn')
    expect(footer).toHaveTextContent('Fanpage: facebook.com/phudinh')
    expect(footer).toHaveTextContent('Zalo Official: oa.zalo.me/ubndphuongphudinh')
    expect(screen.getByRole('link', { name: 'phudinh@tphcm.gov.vn' })).toHaveAttribute('href', 'mailto:phudinh@tphcm.gov.vn')
    const fanpage = screen.getByRole('link', { name: 'facebook.com/phudinh' })
    expect(fanpage).toHaveAttribute('href', 'https://www.facebook.com/phudinh')
    expect(fanpage).toHaveAttribute('target', '_blank')
    expect(fanpage).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'oa.zalo.me/ubndphuongphudinh' })).toHaveAttribute(
      'href',
      'https://oa.zalo.me/ubndphuongphudinh',
    )
  })

  it('shows the NCSC trust badge and hides it when the image cannot load', () => {
    render(<GlobalFooter />)
    const badge = screen.getByRole('img', { name: 'NCSC.vn - Website đạt chứng nhận tin nhiệm mạng' })

    fireEvent.error(badge)

    expect(badge).toHaveStyle({ display: 'none' })
  })

  it('reads its texts from the locale file', () => {
    overrideText('layout.footer.authority.name', 'AUTHORITY')
    overrideText('layout.footer.contact.addressLabel', 'ADDRESS_LABEL')
    overrideText('layout.footer.contact.address', 'ADDRESS')
    overrideText('layout.footer.contact.phoneLabel', 'PHONE_LABEL')
    overrideText('layout.footer.contact.phone', 'PHONE')
    overrideText('layout.footer.regulation.title', 'REGULATION')
    overrideText('layout.footer.contact.emailLabel', 'EMAIL_LABEL')
    overrideText('layout.footer.contact.email', 'hotro@example.vn')
    overrideText('layout.footer.contact.fanpageLabel', 'FANPAGE_LABEL')
    overrideText('layout.footer.contact.fanpage', 'FANPAGE')
    overrideText('layout.footer.contact.zaloLabel', 'ZALO_LABEL')
    overrideText('layout.footer.contact.zalo', 'ZALO')
    overrideText('layout.footer.certification.alt', 'BADGE')
    render(<GlobalFooter />)
    const footer = screen.getByRole('contentinfo')

    expect(screen.getByRole('heading', { name: 'AUTHORITY' })).toBeInTheDocument()
    expect(footer).toHaveTextContent('ADDRESS_LABEL ADDRESS')
    expect(footer).toHaveTextContent('PHONE_LABEL PHONE')
    expect(footer).toHaveTextContent('REGULATION')
    expect(footer).toHaveTextContent('EMAIL_LABEL hotro@example.vn')
    expect(screen.getByRole('link', { name: 'hotro@example.vn' })).toHaveAttribute('href', 'mailto:hotro@example.vn')
    expect(footer).toHaveTextContent('FANPAGE_LABEL FANPAGE')
    expect(footer).toHaveTextContent('ZALO_LABEL ZALO')
    expect(screen.getByRole('img', { name: 'BADGE' })).toBeInTheDocument()
  })
})
