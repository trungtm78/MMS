import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, BookOpen, HelpCircle, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/i18n/types'

interface ArticleKeys {
  title: TranslationKey
  content: TranslationKey
}

interface Section {
  id: string
  title: TranslationKey
  icon: LucideIcon
  articles: readonly ArticleKeys[]
}

/** A help article with its texts read */
interface Article {
  title: string
  content: string
}

// The guide, section by section; every text lives in docs.json (docs.sections.<section>)
const SECTIONS: readonly Section[] = [
  {
    id: 'attendance',
    title: 'docs.sections.attendance.title',
    icon: BookOpen,
    articles: [
      { title: 'docs.sections.attendance.articles.checkIn.title', content: 'docs.sections.attendance.articles.checkIn.content' },
      { title: 'docs.sections.attendance.articles.checkOut.title', content: 'docs.sections.attendance.articles.checkOut.content' },
      { title: 'docs.sections.attendance.articles.missedCheckIn.title', content: 'docs.sections.attendance.articles.missedCheckIn.content' },
    ],
  },
  {
    id: 'tasks',
    title: 'docs.sections.tasks.title',
    icon: BookOpen,
    articles: [
      { title: 'docs.sections.tasks.articles.submitReport.title', content: 'docs.sections.tasks.articles.submitReport.content' },
      { title: 'docs.sections.tasks.articles.updateProgress.title', content: 'docs.sections.tasks.articles.updateProgress.content' },
    ],
  },
  {
    id: 'kpi',
    title: 'docs.sections.kpi.title',
    icon: BookOpen,
    articles: [
      { title: 'docs.sections.kpi.articles.personalScore.title', content: 'docs.sections.kpi.articles.personalScore.content' },
      { title: 'docs.sections.kpi.articles.ratingScale.title', content: 'docs.sections.kpi.articles.ratingScale.content' },
    ],
  },
  {
    id: 'faq',
    title: 'docs.sections.faq.title',
    icon: HelpCircle,
    articles: [
      { title: 'docs.sections.faq.articles.forgotPassword.title', content: 'docs.sections.faq.articles.forgotPassword.content' },
      { title: 'docs.sections.faq.articles.gps.title', content: 'docs.sections.faq.articles.gps.content' },
      { title: 'docs.sections.faq.articles.notifications.title', content: 'docs.sections.faq.articles.notifications.content' },
    ],
  },
]

function AccordionItem({ article }: { article: Article }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
      >
        <span>{article.title}</span>
        {open
          ? <ChevronUp size={16} className="text-[#C62828] flex-shrink-0" />
          : <ChevronDown size={16} className="text-[#64748B] flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-4 py-3 text-sm text-[#64748B] border-t border-[#E2E8F0] bg-[#F8FAFC] leading-relaxed">
          {article.content}
        </div>
      )}
    </div>
  )
}

export function DocumentationPage() {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Client-side search over the texts as the user reads them, regardless of case
  const needle = searchQuery.toLowerCase()
  const filteredSections = SECTIONS.map((section) => ({
    ...section,
    articles: section.articles
      .map(({ title, content }): Article => ({ title: t(title), content: t(content) }))
      .filter((article) =>
        !needle || article.title.toLowerCase().includes(needle) || article.content.toLowerCase().includes(needle),
      ),
  })).filter((s) => s.articles.length > 0 || !searchQuery)

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="documentation-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">{t('docs.page.header.title')}</h1>
        <p className="text-sm text-[#64748B] mt-1">{t('docs.page.header.subtitle')}</p>
      </div>

      {/* Client-side search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
        <input
          type="text"
          placeholder={t('docs.page.search.placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]"
        />
      </div>

      {searchQuery && filteredSections.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center">
          <p className="text-sm text-[#64748B]">{t('docs.page.search.empty', { query: searchQuery })}</p>
        </div>
      )}

      <div className="space-y-4">
        {filteredSections.map((section) => {
          const Icon = section.icon
          const isOpen = activeSection === section.id || !!searchQuery
          return (
            <div key={section.id} className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              {/* Section header: red accent */}
              <button
                onClick={() => setActiveSection(isOpen && !searchQuery ? null : section.id)}
                data-testid={`section-${section.id}`}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F8FAFC] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
                    <Icon size={18} className="text-[#C62828]" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[#C62828]">{t(section.title)}</p>
                    <p className="text-xs text-[#64748B]">{t('docs.page.section.articleCount', { count: section.articles.length })}</p>
                  </div>
                </div>
                {isOpen && !searchQuery
                  ? <ChevronUp size={18} className="text-[#C62828]" />
                  : <ChevronDown size={18} className="text-[#64748B]" />
                }
              </button>
              {(isOpen || searchQuery) && (
                <div className="px-6 pb-5 space-y-2 border-t border-[#E2E8F0] bg-[#F8FAFC]">
                  <div className="pt-4 space-y-2">
                    {section.articles.map((article) => (
                      <AccordionItem key={article.title} article={article} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
