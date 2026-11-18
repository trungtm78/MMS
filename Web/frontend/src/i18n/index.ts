// i18next set up once, synchronously (the resources are bundled), with Vietnamese as the
// default and only language. Components use useTranslation(); other modules use i18n.t.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { defaultNS, resources } from './resources'

void i18n.use(initReactI18next).init({
  resources,
  lng: 'vi',
  fallbackLng: 'vi',
  supportedLngs: ['vi'],
  defaultNS,
  ns: [defaultNS],
  // React escapes rendered text already
  interpolation: { escapeValue: false },
  initAsync: false,
  returnEmptyString: false,
})

export default i18n
