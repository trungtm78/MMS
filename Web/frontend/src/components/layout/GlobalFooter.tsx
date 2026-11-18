import { useTranslation } from 'react-i18next'
import ncscLogo from '@/assets/01c1e386ac3d00655221fee6db98ffe82cf0338c.png'

// Addresses of the ward's public accounts; the names shown for them come from the locale file
const FANPAGE_URL = 'https://www.facebook.com/phudinh'
const ZALO_URL = 'https://oa.zalo.me/ubndphuongphudinh'

export function GlobalFooter() {
  const { t } = useTranslation()
  const email = t('layout.footer.contact.email')
  return (
    <footer className="bg-[#F4F269] border-t-4 border-[#C62828] py-3 px-6 md:px-16 shrink-0">
      <div className="max-w-[1240px] mx-auto">
        <h3 className="text-[#C62828] text-sm font-bold mb-1.5 leading-tight">
          {t('layout.footer.authority.name')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-x-12 gap-y-1 items-start">
          <div className="space-y-1.5 text-xs text-gray-800 leading-tight">
            <p><span className="font-semibold">{t('layout.footer.contact.addressLabel')}</span> {t('layout.footer.contact.address')}</p>
            <p><span className="font-semibold">{t('layout.footer.contact.phoneLabel')}</span> {t('layout.footer.contact.phone')}</p>
            <p className="text-[#2E7D32] font-semibold text-[10px]">{t('layout.footer.regulation.title')}</p>
          </div>
          <div className="space-y-1 text-xs text-gray-800 leading-tight">
            <p><span className="font-semibold">{t('layout.footer.contact.emailLabel')}</span> <a href={`mailto:${email}`} className="text-blue-600 hover:underline">{email}</a></p>
            <p><span className="font-semibold">{t('layout.footer.contact.fanpageLabel')}</span> <a href={FANPAGE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{t('layout.footer.contact.fanpage')}</a></p>
            <p><span className="font-semibold">{t('layout.footer.contact.zaloLabel')}</span> <a href={ZALO_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{t('layout.footer.contact.zalo')}</a></p>
          </div>
          <div className="flex items-start justify-center md:justify-end">
            <img src={ncscLogo} alt={t('layout.footer.certification.alt')} className="h-10 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
          </div>
        </div>
      </div>
    </footer>
  )
}
