import { useState } from 'react'
import { ChevronDown, ChevronUp, BookOpen, HelpCircle, Search } from 'lucide-react'

interface Section {
  id: string
  title: string
  icon: React.ElementType
  articles: { title: string; content: string }[]
}

const SECTIONS: Section[] = [
  {
    id: 'attendance',
    title: 'Hướng dẫn chấm công',
    icon: BookOpen,
    articles: [
      {
        title: 'Cách chấm công vào đầu ca',
        content: 'Mở ứng dụng MMS → chọn "Chấm công" → nhấn "Điểm danh vào" → xác nhận vị trí GPS. Hệ thống sẽ ghi nhận thời gian vào ca tự động.',
      },
      {
        title: 'Cách chấm công ra cuối ca',
        content: 'Vào mục "Chấm công" → nhấn "Điểm danh ra" trước khi kết thúc ca. Đảm bảo bật GPS để hệ thống xác nhận vị trí.',
      },
      {
        title: 'Xử lý khi quên chấm công',
        content: 'Liên hệ trực tiếp với chỉ huy đơn vị để bổ sung điểm danh thủ công. Chỉ được bổ sung trong vòng 24 giờ sau ca làm việc.',
      },
    ],
  },
  {
    id: 'tasks',
    title: 'Hướng dẫn báo cáo nhiệm vụ',
    icon: BookOpen,
    articles: [
      {
        title: 'Cách tạo báo cáo nhiệm vụ',
        content: 'Vào "Nhiệm vụ" → chọn nhiệm vụ cần báo cáo → nhấn "Nộp báo cáo" → điền đầy đủ nội dung thực hiện, kết quả và đính kèm ảnh/video nếu có.',
      },
      {
        title: 'Cập nhật tiến độ nhiệm vụ',
        content: 'Mở nhiệm vụ → nhấn "Cập nhật tiến độ" → chọn % hoàn thành → thêm ghi chú nếu cần. Nên cập nhật ít nhất 1 lần/ngày với nhiệm vụ dài ngày.',
      },
    ],
  },
  {
    id: 'kpi',
    title: 'Hướng dẫn xem KPI',
    icon: BookOpen,
    articles: [
      {
        title: 'Xem điểm KPI cá nhân',
        content: 'Vào "Chỉ tiêu KPI" để xem điểm tổng hợp của bạn theo tháng/quý. Điểm được tính dựa trên: chấm công (40%), hoàn thành nhiệm vụ (40%), huấn luyện (20%).',
      },
      {
        title: 'Hiểu kết quả đánh giá',
        content: 'Xuất sắc: 90-100 | Giỏi: 80-89 | Khá: 70-79 | Trung bình: 60-69 | Cần cải thiện: < 60.',
      },
    ],
  },
  {
    id: 'faq',
    title: 'Câu hỏi thường gặp',
    icon: HelpCircle,
    articles: [
      {
        title: 'Quên mật khẩu phải làm gì?',
        content: 'Nhấn "Quên mật khẩu" ở màn hình đăng nhập → nhập email đăng ký → kiểm tra email để nhận link đặt lại mật khẩu.',
      },
      {
        title: 'Ứng dụng không nhận GPS?',
        content: 'Kiểm tra: 1) Bật GPS (Cài đặt → Vị trí → Bật). 2) Cấp quyền vị trí cho ứng dụng MMS. 3) Đứng nơi thoáng không bị che khuất.',
      },
      {
        title: 'Không nhận được thông báo?',
        content: 'Vào Cài đặt điện thoại → Ứng dụng → MMS → Thông báo → Bật tất cả. Sau đó kiểm tra lại trong Cài đặt MMS → Thông báo.',
      },
    ],
  },
]

function AccordionItem({ article }: { article: { title: string; content: string } }) {
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
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Client-side search filter
  const filteredSections = SECTIONS.map((section) => ({
    ...section,
    articles: searchQuery
      ? section.articles.filter(
          (a) =>
            a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : section.articles,
  })).filter((s) => s.articles.length > 0 || !searchQuery)

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="documentation-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Tài Liệu Hướng Dẫn</h1>
        <p className="text-sm text-[#64748B] mt-1">Hướng dẫn sử dụng hệ thống MMS cho DQTV</p>
      </div>

      {/* Client-side search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
        <input
          type="text"
          placeholder="Tìm kiếm trong tài liệu..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]"
        />
      </div>

      {searchQuery && filteredSections.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-8 text-center">
          <p className="text-sm text-[#64748B]">Không tìm thấy kết quả cho "{searchQuery}"</p>
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
                    <p className="text-sm font-semibold text-[#C62828]">{section.title}</p>
                    <p className="text-xs text-[#64748B]">{section.articles.length} bài hướng dẫn</p>
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
                    {section.articles.map((article, i) => (
                      <AccordionItem key={i} article={article} />
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
