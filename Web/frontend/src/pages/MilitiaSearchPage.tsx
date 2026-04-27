import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
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

  const results = data?.data ?? []

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'active':   return { label: 'Đang hoạt động', class: 'bg-green-100 text-green-700' }
      case 'inactive': return { label: 'Đã xuất ngũ',    class: 'bg-gray-100 text-gray-600' }
      default:         return { label: status,            class: 'bg-gray-100 text-gray-600' }
    }
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen" data-testid="militia-search-page">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-[#C62828]">Tìm kiếm Dân Quân Tự Vệ</h1>
        <p className="text-sm text-[#64748B] mt-1">Tra cứu thông tin dân quân theo nhiều tiêu chí</p>
      </div>

      {/* Search panel */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
                Tìm kiếm nhanh
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={18} />
                <input
                  type="text"
                  placeholder="Nhập họ tên, mã DQTV..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="w-full h-12 pl-10 pr-4 border-2 border-[#C62828] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] text-sm text-[#0F172A] placeholder-[#64748B]"
                  data-testid="militia-search-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
                Đơn vị
              </label>
              <input
                type="text"
                placeholder="Mã đơn vị..."
                value={unitFilter}
                onChange={e => setUnitFilter(e.target.value)}
                className="w-full h-12 px-4 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A] placeholder-[#64748B]"
                data-testid="unit-filter-input"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={handleReset}
              className="px-6 py-2.5 border border-[#E2E8F0] text-[#64748B] rounded-lg hover:bg-[#F8FAFC] text-sm font-medium flex items-center gap-2 transition-colors"
              data-testid="reset-search-btn"
            >
              <X size={15} />
              Đặt lại
            </button>
            <button
              onClick={handleSearch}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-6 py-2.5 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
              data-testid="search-btn"
            >
              <Search size={16} />
              Tìm kiếm
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {hasSearched && (
        <div
          className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm"
          data-testid="search-results"
        >
          <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
            <h3 className="text-base font-semibold text-[#0F172A]">
              Kết quả tìm kiếm
            </h3>
            <span className="text-sm text-[#64748B]">
              {isLoading ? '...' : `${results.length} bản ghi`}
            </span>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl border border-[#E2E8F0]">
                  <div className="w-14 h-14 animate-pulse bg-[#E2E8F0] rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 animate-pulse bg-[#E2E8F0] rounded w-1/3" />
                    <div className="h-3 animate-pulse bg-[#E2E8F0] rounded w-1/4" />
                    <div className="h-3 animate-pulse bg-[#E2E8F0] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center" data-testid="empty-state">
              <div className="w-20 h-20 bg-[#F8FAFC] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#E2E8F0]">
                <Search size={32} className="text-[#64748B]" />
              </div>
              <h3 className="text-base font-medium text-[#0F172A] mb-2">Không tìm thấy kết quả</h3>
              <p className="text-sm text-[#64748B]">Vui lòng thử lại với từ khóa khác</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0] p-4 space-y-2">
              {results.map(result => {
                const statusInfo = getStatusInfo(result.status)
                return (
                  <div
                    key={result.id}
                    className="bg-white rounded-xl border border-[#E2E8F0] p-4 hover:shadow-md transition-all cursor-pointer"
                    data-testid={`search-result-${result.id}`}
                  >
                    <div className="flex gap-4">
                      {/* Avatar */}
                      <div className="w-14 h-14 bg-[#2E7D32] text-white flex items-center justify-center rounded-full flex-shrink-0 text-lg font-bold shadow-sm">
                        {result.fullName.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-base font-semibold text-[#0F172A]">{result.fullName}</h4>
                            <p className="text-sm text-[#64748B]">
                              Mã:{' '}
                              <span className="font-semibold text-[#1F3A5F]">{result.militiaCode}</span>
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${statusInfo.class}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-[#64748B]">
                          <span className="truncate">{result.unitName ?? result.unitCode}</span>
                          <span className="truncate">{result.rank ?? '—'}</span>
                          <span className="truncate">{result.phone ?? '—'}</span>
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
