import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DocumentationPage } from './DocumentationPage'
import { t } from '@/test/i18n'

// Every help article, by section, with its exact text
const ARTICLES = [
  ['attendance', 'Cách chấm công vào đầu ca', 'Mở ứng dụng MMS → chọn "Chấm công" → nhấn "Điểm danh vào" → xác nhận vị trí GPS. Hệ thống sẽ ghi nhận thời gian vào ca tự động.'],
  ['attendance', 'Cách chấm công ra cuối ca', 'Vào mục "Chấm công" → nhấn "Điểm danh ra" trước khi kết thúc ca. Đảm bảo bật GPS để hệ thống xác nhận vị trí.'],
  ['attendance', 'Xử lý khi quên chấm công', 'Liên hệ trực tiếp với chỉ huy đơn vị để bổ sung điểm danh thủ công. Chỉ được bổ sung trong vòng 24 giờ sau ca làm việc.'],
  ['tasks', 'Cách tạo báo cáo nhiệm vụ', 'Vào "Nhiệm vụ" → chọn nhiệm vụ cần báo cáo → nhấn "Nộp báo cáo" → điền đầy đủ nội dung thực hiện, kết quả và đính kèm ảnh/video nếu có.'],
  ['tasks', 'Cập nhật tiến độ nhiệm vụ', 'Mở nhiệm vụ → nhấn "Cập nhật tiến độ" → chọn % hoàn thành → thêm ghi chú nếu cần. Nên cập nhật ít nhất 1 lần/ngày với nhiệm vụ dài ngày.'],
  ['kpi', 'Xem điểm KPI cá nhân', 'Vào "Chỉ tiêu KPI" để xem điểm tổng hợp của bạn theo tháng/quý. Điểm được tính dựa trên: chấm công (40%), hoàn thành nhiệm vụ (40%), huấn luyện (20%).'],
  ['kpi', 'Hiểu kết quả đánh giá', 'Xuất sắc: 90-100 | Giỏi: 80-89 | Khá: 70-79 | Trung bình: 60-69 | Cần cải thiện: < 60.'],
  ['faq', 'Quên mật khẩu phải làm gì?', 'Nhấn "Quên mật khẩu" ở màn hình đăng nhập → nhập email đăng ký → kiểm tra email để nhận link đặt lại mật khẩu.'],
  ['faq', 'Ứng dụng không nhận GPS?', 'Kiểm tra: 1) Bật GPS (Cài đặt → Vị trí → Bật). 2) Cấp quyền vị trí cho ứng dụng MMS. 3) Đứng nơi thoáng không bị che khuất.'],
  ['faq', 'Không nhận được thông báo?', 'Vào Cài đặt điện thoại → Ứng dụng → MMS → Thông báo → Bật tất cả. Sau đó kiểm tra lại trong Cài đặt MMS → Thông báo.'],
] as const

describe('DocumentationPage', () => {
  it('renders heading', () => {
    render(<DocumentationPage />)
    expect(screen.getByText('Tài Liệu Hướng Dẫn')).toBeInTheDocument()
  })

  it('renders all 4 sections', () => {
    render(<DocumentationPage />)
    expect(screen.getByTestId('section-attendance')).toBeInTheDocument()
    expect(screen.getByTestId('section-tasks')).toBeInTheDocument()
    expect(screen.getByTestId('section-kpi')).toBeInTheDocument()
    expect(screen.getByTestId('section-faq')).toBeInTheDocument()
  })

  it('expands section on click and shows articles', () => {
    render(<DocumentationPage />)
    fireEvent.click(screen.getByTestId('section-attendance'))
    expect(screen.getByText('Cách chấm công vào đầu ca')).toBeInTheDocument()
  })

  it('collapses section on second click', () => {
    render(<DocumentationPage />)
    const btn = screen.getByTestId('section-attendance')
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText('Cách chấm công vào đầu ca')).not.toBeInTheDocument()
  })

  it('introduces the guide and offers a search', () => {
    render(<DocumentationPage />)
    expect(screen.getByRole('heading', { name: 'Tài Liệu Hướng Dẫn' })).toBeInTheDocument()
    expect(screen.getByText('Hướng dẫn sử dụng hệ thống MMS cho DQTV')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tìm kiếm trong tài liệu...')).toBeInTheDocument()
  })

  it.each([
    ['attendance', 'Hướng dẫn chấm công', 3],
    ['tasks', 'Hướng dẫn báo cáo nhiệm vụ', 2],
    ['kpi', 'Hướng dẫn xem KPI', 2],
    ['faq', 'Câu hỏi thường gặp', 3],
  ])('names the %s section and counts its articles', (id, title, count) => {
    render(<DocumentationPage />)
    expect(screen.getByTestId(`section-${id}`)).toHaveTextContent(`${title}${count} bài hướng dẫn`)
  })

  it.each(ARTICLES)('shows the %s article "%s" with its text when opened', (section, title, content) => {
    render(<DocumentationPage />)
    fireEvent.click(screen.getByTestId(`section-${section}`))
    expect(screen.queryByText(content)).not.toBeInTheDocument()
    const article = screen.getByRole('button', { name: title })
    fireEvent.click(article)
    expect(screen.getByText(content)).toBeInTheDocument()
    fireEvent.click(article)
    expect(screen.queryByText(content)).not.toBeInTheDocument()
  })

  it('searches titles and texts regardless of case and keeps the matching sections open', () => {
    render(<DocumentationPage />)
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm trong tài liệu...'), { target: { value: 'gps' } })

    expect(screen.getByTestId('section-attendance')).toHaveTextContent('Hướng dẫn chấm công2 bài hướng dẫn')
    expect(screen.getByTestId('section-faq')).toHaveTextContent('Câu hỏi thường gặp1 bài hướng dẫn')
    expect(screen.queryByTestId('section-tasks')).not.toBeInTheDocument()
    expect(screen.queryByTestId('section-kpi')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cách chấm công vào đầu ca' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cách chấm công ra cuối ca' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ứng dụng không nhận GPS?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xử lý khi quên chấm công' })).not.toBeInTheDocument()
  })

  it('says nothing matches a search without results', () => {
    render(<DocumentationPage />)
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm trong tài liệu...'), { target: { value: 'không có từ này' } })
    const page = screen.getByTestId('documentation-page')
    expect(within(page).getByText('Không tìm thấy kết quả cho "không có từ này"')).toBeInTheDocument()
    expect(within(page).queryByTestId(/^section-/)).not.toBeInTheDocument()
  })

  // Every text comes from the docs module (src/i18n/locales/vi/docs.json)
  describe('texts from the docs module', () => {
    it('reads the header, the search and its empty result from docs.page', () => {
      render(<DocumentationPage />)
      expect(screen.getByRole('heading', { name: t('docs.page.header.title') })).toBeInTheDocument()
      expect(screen.getByText(t('docs.page.header.subtitle'))).toBeInTheDocument()
      const search = screen.getByPlaceholderText(t('docs.page.search.placeholder'))
      fireEvent.change(search, { target: { value: 'zzz' } })
      expect(screen.getByText(t('docs.page.search.empty', { query: 'zzz' }))).toBeInTheDocument()
    })

    it.each([
      ['attendance', 'docs.sections.attendance.title', [
        ['docs.sections.attendance.articles.checkIn.title', 'docs.sections.attendance.articles.checkIn.content'],
        ['docs.sections.attendance.articles.checkOut.title', 'docs.sections.attendance.articles.checkOut.content'],
        ['docs.sections.attendance.articles.missedCheckIn.title', 'docs.sections.attendance.articles.missedCheckIn.content'],
      ]],
      ['tasks', 'docs.sections.tasks.title', [
        ['docs.sections.tasks.articles.submitReport.title', 'docs.sections.tasks.articles.submitReport.content'],
        ['docs.sections.tasks.articles.updateProgress.title', 'docs.sections.tasks.articles.updateProgress.content'],
      ]],
      ['kpi', 'docs.sections.kpi.title', [
        ['docs.sections.kpi.articles.personalScore.title', 'docs.sections.kpi.articles.personalScore.content'],
        ['docs.sections.kpi.articles.ratingScale.title', 'docs.sections.kpi.articles.ratingScale.content'],
      ]],
      ['faq', 'docs.sections.faq.title', [
        ['docs.sections.faq.articles.forgotPassword.title', 'docs.sections.faq.articles.forgotPassword.content'],
        ['docs.sections.faq.articles.gps.title', 'docs.sections.faq.articles.gps.content'],
        ['docs.sections.faq.articles.notifications.title', 'docs.sections.faq.articles.notifications.content'],
      ]],
    ] as const)('reads the %s section and its articles from docs.sections', (section, titleKey, articles) => {
      render(<DocumentationPage />)
      const header = screen.getByTestId(`section-${section}`)
      expect(header).toHaveTextContent(`${t(titleKey)}${t('docs.page.section.articleCount', { count: articles.length })}`)
      fireEvent.click(header)
      for (const [articleTitle, articleContent] of articles) {
        fireEvent.click(screen.getByRole('button', { name: t(articleTitle) }))
        expect(screen.getByText(t(articleContent))).toBeInTheDocument()
      }
    })
  })
})
