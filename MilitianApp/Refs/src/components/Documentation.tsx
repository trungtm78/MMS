import { useState } from 'react';
import { Login } from './Login';
import { Home } from './Home';
import { MyTasks } from './MyTasks';
import { CheckIn } from './CheckIn';
import { KPI } from './KPI';
import { Profile } from './Profile';
import { TaskReport } from './TaskReport';
import { LeaveRequest } from './LeaveRequest';
import { EmergencySOS } from './EmergencySOS';
import { FileText, Printer, Download, HelpCircle, X } from 'lucide-react';

interface ScreenDocProps {
  title: string;
  description: string;
  features: string[];
  component: React.ReactNode;
  screenNumber: number;
  totalScreens: number;
}

function ScreenDoc({ title, description, features, component, screenNumber, totalScreens }: ScreenDocProps) {
  return (
    <div className="doc-page">
      {/* Header */}
      <div className="doc-header">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-[#366092]">
            Hệ thống Quản lý Dân Quân Tự Vệ
          </h1>
          <span className="text-sm text-gray-500">
            Trang {screenNumber}/{totalScreens}
          </span>
        </div>
        <div className="border-b-2 border-[#366092] pb-2 mb-4">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">Phường Phú Định - TP.HCM</p>
        </div>
      </div>

      {/* Description */}
      <div className="doc-description">
        <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
      </div>

      {/* Features */}
      <div className="doc-features">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Tính năng chính:</h3>
        <ul className="list-disc list-inside space-y-1">
          {features.map((feature, index) => (
            <li key={index} className="text-sm text-gray-700">{feature}</li>
          ))}
        </ul>
      </div>

      {/* Screenshot */}
      <div className="doc-screenshot">
        <div className="screenshot-container">
          <div className="phone-frame">
            <div className="phone-content">
              {component}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="doc-footer">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>© 2024 Hệ thống DQTV Phường Phú Định</span>
          <span>{new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>
    </div>
  );
}

export function Documentation() {
  const [isPrintView, setIsPrintView] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const handlePrint = () => {
    setIsPrintView(true);
    setShowGuide(false);
    setTimeout(() => {
      window.print();
      setIsPrintView(false);
    }, 500);
  };

  const screens = [
    {
      title: '1. Màn hình Đăng nhập',
      description: 'Màn hình xác thực người dùng với hỗ trợ sinh trắc học và xác thực hai yếu tố. Đảm bảo bảo mật cao cho ứng dụng quản lý DQTV với mã hóa end-to-end.',
      features: [
        'Đăng nhập bằng username/password hoặc sinh trắc học (Face ID/Touch ID)',
        'Xác thực hai yếu tố (2FA) qua SMS hoặc ứng dụng Authenticator',
        'Quên mật khẩu và khôi phục tài khoản qua email',
        'Ghi nhớ đăng nhập trên thiết bị an toàn',
        'Chế độ offline với xác thực cache',
        'Thông báo lỗi rõ ràng và hướng dẫn khắc phục'
      ],
      component: <Login onLogin={() => {}} />
    },
    {
      title: '2. Màn hình Trang chủ',
      description: 'Dashboard tổng quan hiển thị thông tin quan trọng nhất cho thành viên DQTV. Giao diện được tối ưu cho sử dụng ngoài trời với độ tương phản cao.',
      features: [
        'Thông tin cá nhân và chức danh của thành viên',
        'Thống kê nhiệm vụ: đang thực hiện, hoàn thành, quá hạn',
        'Thống kê điểm danh tháng hiện tại và tỷ lệ hoàn thành',
        'Đánh giá chỉ tiêu KPI với biểu đồ trực quan',
        'Truy cập nhanh các chức năng: báo cáo công việc, đăng ký nghỉ phép, SOS khẩn cấp',
        'Thông báo và cảnh báo quan trọng',
        'Làm mới dữ liệu bằng pull-to-refresh'
      ],
      component: <Home onOpenReport={() => {}} onSwitchTab={() => {}} />
    },
    {
      title: '3. Màn hình Nhiệm vụ',
      description: 'Quản lý tất cả nhiệm vụ được giao cho thành viên DQTV. Hỗ trợ lọc, tìm kiếm và cập nhật trạng thái nhiệm vụ theo thời gian thực.',
      features: [
        'Danh sách nhiệm vụ được phân loại: Tất cả, Mới, Đang thực hiện, Hoàn thành',
        'Badge hiển thị số lượng nhiệm vụ theo từng trạng thái',
        'Thông tin chi tiết: tiêu đề, thời gian, độ ưu tiên, người giao việc',
        'Cập nhật trạng thái nhiệm vụ nhanh chóng',
        'Xem chi tiết nhiệm vụ với mô tả đầy đủ và tài liệu đính kèm',
        'Thông báo nhắc nhở nhiệm vụ sắp đến hạn',
        'Tìm kiếm nhiệm vụ theo từ khóa',
        'Chế độ offline: lưu trữ và đồng bộ khi có kết nối'
      ],
      component: <MyTasks onBack={() => {}} />
    },
    {
      title: '4. Màn hình Điểm danh',
      description: 'Hệ thống điểm danh tự động sử dụng GPS và xác thực vị trí. Đảm bảo thành viên DQTV có mặt đúng địa điểm và thời gian quy định.',
      features: [
        'Điểm danh nhanh bằng GPS với xác thực vị trí chính xác (bán kính 50m)',
        'Lịch sử điểm danh chi tiết theo tháng với trạng thái: Đúng giờ, Muộn, Vắng',
        'Bản đồ hiển thị vị trí điểm danh và khoảng cách đến địa điểm',
        'Thống kê tỷ lệ điểm danh: tổng số ngày, đúng giờ, muộn, vắng',
        'Chụp ảnh xác nhận khi điểm danh',
        'Ghi chú lý do nếu đến muộn hoặc điểm danh ngoài phạm vi',
        'Nhắc nhở điểm danh vào đầu ca làm việc',
        'Xuất báo cáo điểm danh theo tháng/quý',
        'Chế độ offline: lưu và đồng bộ khi có mạng'
      ],
      component: <CheckIn onBack={() => {}} />
    },
    {
      title: '5. Màn hình Chỉ tiêu KPI',
      description: 'Theo dõi và đánh giá các chỉ tiêu công việc của thành viên DQTV. Hệ thống tính điểm tự động dựa trên các tiêu chí được thiết lập.',
      features: [
        'Bảng điểm KPI tổng hợp với xếp hạng: Xuất sắc, Tốt, Trung bình, Cần cải thiện',
        'Biểu đồ hình tròn thể hiện tỷ lệ hoàn thành các chỉ tiêu',
        'Biểu đồ cột so sánh điểm số theo từng tháng',
        'Chi tiết các chỉ tiêu: Điểm danh, Nhiệm vụ, Kỷ luật, Huấn luyện, Tham gia hoạt động',
        'Lịch sử đánh giá và nhận xét từ cấp trên',
        'Mục tiêu và kế hoạch cải thiện',
        'Thông báo khi có đánh giá mới',
        'So sánh với điểm trung bình đơn vị',
        'Xuất báo cáo KPI định kỳ'
      ],
      component: <KPI onBack={() => {}} />
    },
    {
      title: '6. Màn hình Cá nhân',
      description: 'Quản lý thông tin cá nhân, cài đặt ứng dụng và các yêu cầu của thành viên DQTV. Tùy chỉnh trải nghiệm sử dụng theo nhu cầu cá nhân.',
      features: [
        'Thông tin cá nhân: họ tên, mã số, chức vụ, đơn vị, ngày gia nhập',
        'Ảnh đại diện và thông tin liên hệ',
        'Quản lý yêu cầu: nghỉ phép, thay đổi ca, hỗ trợ',
        'Lịch sử hoạt động và thành tích',
        'Cài đặt: thông báo, ngôn ngữ, chế độ tối, bảo mật sinh trắc học',
        'Chính sách bảo mật và điều khoản sử dụng',
        'Hỗ trợ và phản hồi',
        'Đăng xuất an toàn'
      ],
      component: <Profile onLogout={() => {}} onBack={() => {}} />
    },
    {
      title: '7. Màn hình Báo cáo Công việc',
      description: 'Gửi báo cáo tiến độ công việc định kỳ hoặc đột xuất. Hỗ trợ đính kèm hình ảnh, video và tài liệu minh chứng.',
      features: [
        'Form báo cáo công việc với các trường thông tin chi tiết',
        'Chọn loại báo cáo: hàng ngày, tuần, tháng, đột xuất',
        'Chọn nhiệm vụ liên quan từ danh sách',
        'Mô tả chi tiết công việc đã thực hiện',
        'Đính kèm hình ảnh, video, tài liệu (tối đa 10 files)',
        'Ghi chú khó khăn, vướng mắc cần hỗ trợ',
        'Lưu nháp để hoàn thiện sau',
        'Xem lại lịch sử báo cáo đã gửi',
        'Nhận phản hồi từ cấp trên'
      ],
      component: <TaskReport onBack={() => {}} />
    },
    {
      title: '8. Màn hình Đăng ký Nghỉ phép',
      description: 'Đăng ký nghỉ phép, nghỉ ốm hoặc các loại nghỉ khác theo quy định. Theo dõi trạng thái duyệt và quản lý ngày phép còn lại.',
      features: [
        'Form đăng ký nghỉ phép với chọn loại: phép năm, ốm, việc riêng, thai sản',
        'Chọn thời gian nghỉ từ ngày đến ngày',
        'Nhập lý do nghỉ chi tiết',
        'Đính kèm giấy tờ chứng minh (đơn xin phép, giấy khám bệnh)',
        'Chọn người thay thế trong thời gian nghỉ',
        'Hiển thị số ngày phép còn lại',
        'Lịch sử đơn nghỉ: đã duyệt, chờ duyệt, từ chối',
        'Thông báo khi đơn được xử lý',
        'Hủy đơn nghỉ nếu chưa được duyệt'
      ],
      component: <LeaveRequest onBack={() => {}} />
    },
    {
      title: '9. Màn hình Báo cáo SOS Khẩn cấp',
      description: 'Báo cáo tình huống khẩn cấp cần hỗ trợ ngay lập tức. Tự động gửi vị trí GPS và thông tin người báo cáo đến trung tâm điều hành.',
      features: [
        'Nút SOS khẩn cấp với màu đỏ nổi bật, dễ nhận biết',
        'Tự động gửi vị trí GPS chính xác khi báo cáo',
        'Chọn loại sự cố: cháy nổ, tai nạn, đột quỵ, hành vi khả nghi, thiên tai, khác',
        'Mô tả chi tiết tình huống',
        'Đính kèm ảnh/video hiện trường',
        'Gọi điện trực tiếp đến số hotline khẩn cấp',
        'Gửi thông báo đến tất cả thành viên DQTV trong bán kính 5km',
        'Theo dõi trạng thái xử lý sự cố',
        'Lịch sử báo cáo SOS'
      ],
      component: <EmergencySOS onBack={() => {}} />
    }
  ];

  return (
    <div className={isPrintView ? 'print-mode' : 'screen-mode'}>
      {/* Screen View - Show navigation */}
      {!isPrintView && (
        <div className="no-print bg-white border-b border-gray-200 p-4 sticky top-0 z-50 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#366092] flex items-center gap-2">
                <FileText className="w-6 h-6" />
                Tài liệu Hệ thống DQTV
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Phường Phú Định - TP.HCM • {screens.length} màn hình
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGuide(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
                Hướng dẫn
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-[#366092] text-white rounded-lg hover:bg-[#2a4d73] transition-colors"
              >
                <Download className="w-5 h-5" />
                Xuất PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="no-print fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#366092] flex items-center gap-2">
                <HelpCircle className="w-6 h-6" />
                Hướng dẫn xuất tài liệu
              </h2>
              <button
                onClick={() => setShowGuide(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Method 1: PDF */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-[#366092] text-lg mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Phương án 1: Xuất file PDF (Khuyên dùng)
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-[#366092] text-white rounded-full flex items-center justify-center font-semibold text-xs">1</span>
                    <p>Nhấn nút <strong>"Xuất PDF"</strong> ở góc trên bên phải màn hình</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-[#366092] text-white rounded-full flex items-center justify-center font-semibold text-xs">2</span>
                    <p>Trình duyệt sẽ mở cửa sổ in. Tại đây:</p>
                  </div>
                  <div className="ml-9 space-y-2">
                    <p>• <strong>Destination/Máy in:</strong> Chọn "Save as PDF" hoặc "Lưu thành PDF"</p>
                    <p>• <strong>Layout/Bố cục:</strong> Chọn "Portrait" (Dọc)</p>
                    <p>• <strong>Pages/Trang:</strong> Chọn "All" (Tất cả)</p>
                    <p>• <strong>Scale/Tỷ lệ:</strong> Để 100%</p>
                    <p>• <strong>Margins/Lề:</strong> Chọn "Default" hoặc "Custom" (15mm)</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-[#366092] text-white rounded-full flex items-center justify-center font-semibold text-xs">3</span>
                    <p>Nhấn <strong>"Save"</strong> và chọn vị trí lưu file</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-[#366092] text-white rounded-full flex items-center justify-center font-semibold text-xs">4</span>
                    <p>File PDF sẽ có <strong>9 trang</strong>, mỗi trang là 1 màn hình</p>
                  </div>
                </div>
              </div>

              {/* Method 2: Images */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-700 text-lg mb-3 flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Phương án 2: Chụp màn hình từng trang
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold text-xs">1</span>
                    <p>Cuộn xuống để xem từng màn hình trên trang này</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold text-xs">2</span>
                    <p>Sử dụng phím tắt chụp màn hình:</p>
                  </div>
                  <div className="ml-9 space-y-2">
                    <p>• <strong>Windows:</strong> Nhấn <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">Win + Shift + S</kbd></p>
                    <p>• <strong>Mac:</strong> Nhấn <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">Cmd + Shift + 4</kbd></p>
                    <p>• <strong>Chrome:</strong> Dùng DevTools (F12) → Menu (⋮) → Capture screenshot</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold text-xs">3</span>
                    <p>Chụp lần lượt 9 màn hình và lưu thành file ảnh</p>
                  </div>
                </div>
              </div>

              {/* Method 3: Browser extensions */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-semibold text-purple-700 text-lg mb-3 flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  Phương án 3: Sử dụng Extension
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <p>Cài đặt extension chụp toàn bộ trang web:</p>
                  <div className="ml-4 space-y-2">
                    <p>• <strong>Chrome/Edge:</strong> "Full Page Screen Capture" hoặc "GoFullPage"</p>
                    <p>• <strong>Firefox:</strong> "Nimbus Screenshot" hoặc "Fireshot"</p>
                  </div>
                  <p className="mt-3">Extension sẽ tự động chụp toàn bộ trang và xuất thành 1 file ảnh dài hoặc PDF.</p>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-800 text-base mb-2">💡 Mẹo:</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li>• Sử dụng <strong>Phương án 1 (PDF)</strong> để có chất lượng tốt nhất</li>
                  <li>• File PDF có thể dễ dàng in ra giấy A4 mà không bị mất format</li>
                  <li>• Nếu cần file ảnh, hãy chụp từ PDF bằng công cụ "Export to Images"</li>
                  <li>• Đảm bảo độ phóng đại trình duyệt là 100% trước khi xuất</li>
                </ul>
              </div>

              {/* Quick action */}
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowGuide(false);
                    handlePrint();
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-[#366092] text-white rounded-lg hover:bg-[#2a4d73] transition-colors font-semibold"
                >
                  <Download className="w-5 h-5" />
                  Xuất PDF ngay
                </button>
                <button
                  onClick={() => setShowGuide(false)}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documentation Pages */}
      <div className="documentation-content">
        {screens.map((screen, index) => (
          <ScreenDoc
            key={index}
            title={screen.title}
            description={screen.description}
            features={screen.features}
            component={screen.component}
            screenNumber={index + 1}
            totalScreens={screens.length}
          />
        ))}
      </div>

      {/* Print Styles */}
      <style>{`
        /* Screen Mode */
        .screen-mode {
          background: #f3f4f6;
          min-height: 100vh;
          padding-bottom: 2rem;
        }

        .screen-mode .documentation-content {
          max-width: 210mm;
          margin: 0 auto;
          padding: 1rem;
        }

        .screen-mode .doc-page {
          background: white;
          margin: 1rem 0;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        /* Print Mode */
        .print-mode .no-print {
          display: none !important;
        }

        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: 15mm 10mm;
          }

          body {
            margin: 0;
            padding: 0;
          }

          .no-print {
            display: none !important;
          }

          .doc-page {
            width: 190mm;
            height: 267mm;
            page-break-after: always;
            page-break-inside: avoid;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            background: white;
          }

          .doc-page:last-child {
            page-break-after: auto;
          }

          .doc-header {
            flex-shrink: 0;
            margin-bottom: 8mm;
          }

          .doc-description {
            flex-shrink: 0;
            margin-bottom: 6mm;
          }

          .doc-features {
            flex-shrink: 0;
            margin-bottom: 8mm;
          }

          .doc-screenshot {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8mm;
            min-height: 0;
          }

          .doc-footer {
            flex-shrink: 0;
            border-top: 1px solid #e5e7eb;
            padding-top: 4mm;
          }

          .screenshot-container {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .phone-frame {
            width: 375px;
            height: auto;
            max-height: 140mm;
            border: 3px solid #1f2937;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            background: white;
          }

          .phone-content {
            width: 375px;
            height: auto;
            overflow: hidden;
            transform-origin: top left;
            background: white;
          }

          .phone-content > div {
            max-height: 650px;
            overflow: hidden;
          }
        }

        /* Common Styles */
        .doc-header h1 {
          font-size: 18pt;
          font-weight: 700;
          color: #366092;
        }

        .doc-header h2 {
          font-size: 16pt;
          font-weight: 600;
          color: #1f2937;
        }

        .doc-description p {
          font-size: 10pt;
          line-height: 1.5;
          color: #374151;
        }

        .doc-features h3 {
          font-size: 10pt;
          font-weight: 600;
          color: #1f2937;
        }

        .doc-features li {
          font-size: 9pt;
          line-height: 1.4;
          color: #374151;
        }

        .doc-footer {
          font-size: 8pt;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}