import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, User as UserIcon } from 'lucide-react'
import { searchMilitia } from '@/api/militia'

export function MilitiaSearchPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [submittedTerm, setSubmittedTerm] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['militia-search', submittedTerm, unitFilter],
    queryFn: () => searchMilitia({ q: submittedTerm, unitCode: unitFilter || undefined, limit: 50 }),
    enabled: hasSearched,
  })

  const handleSearch = useCallback(() => {
    setSubmittedTerm(searchTerm)
    setHasSearched(true)
  }, [searchTerm])

  const handleReset = () => {
    setSearchTerm('')
    setSubmittedTerm('')
    setUnitFilter('')
    setHasSearched(false)
  }

  const results = data ?? []

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Đang hoạt động', class: 'bg-green-100 text-green-700' }
      case 'inactive': return { label: 'Đã xuất ngũ', class: 'bg-gray-100 text-gray-700' }
      default: return { label: status, class: 'bg-gray-100 text-gray-700' }
    }
  }

  return (
    <div className="p-6 space-y-6" data-testid="militia-search-page">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Tìm kiếm Dân Quân Tự Vệ</h1>
        <p className="text-sm text-gray-500 mt-1">Tra cứu thông tin dân quân theo nhiều tiêu chí</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tìm kiếm nhanh</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Nhập họ tên, mã DQTV..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="militia-search-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Đơn vị</label>
              <input
                type="text"
                placeholder="Mã đơn vị..."
                value={unitFilter}
                onChange={e => setUnitFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                data-testid="unit-filter-input"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={handleReset} className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium" data-testid="reset-search-btn">
              Đặt lại
            </button>
            <button
              onClick={handleSearch}
              className="px-6 py-2.5 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] flex items-center gap-2 text-sm font-medium"
              data-testid="search-btn"
            >
              <Search size={16} />
              Tìm kiếm
            </button>
          </div>
        </div>
      </div>

      {hasSearched && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200" data-testid="search-results">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900">
              Kết quả tìm kiếm ({isLoading ? '...' : results.length})
            </h3>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-500">Đang tìm kiếm...</div>
          ) : results.length === 0 ? (
            <div className="p-12 text-center" data-testid="empty-state">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={32} className="text-gray-400" />
              </div>
              <h3 className="text-base font-medium text-gray-900 mb-2">Không tìm thấy kết quả</h3>
              <p className="text-sm text-gray-500">Vui lòng thử lại với từ khóa khác</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {results.map(result => {
                const statusInfo = getStatusInfo(result.status)
                return (
                  <div key={result.id} className="p-6 hover:bg-gray-50 transition-colors" data-testid={`search-result-${result.id}`}>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center rounded-lg border-2 border-gray-300 flex-shrink-0">
                        <UserIcon size={28} className="text-gray-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-base font-semibold text-gray-900">{result.fullName}</h4>
                            <p className="text-sm text-gray-600">Mã: <span className="font-medium text-[#1F3A5F]">{result.militiaCode}</span></p>
                          </div>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusInfo.class}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                          <span>{result.unitName ?? result.unitCode}</span>
                          <span>{result.rank ?? '—'}</span>
                          <span>{result.phone ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
