import { useState } from 'react';
import { FileText, Printer, ChevronDown, ChevronUp, Maximize2, Monitor, ZoomIn, ZoomOut } from 'lucide-react';
import { Dashboard } from '@/app/components/Dashboard';
import { MilitiaList } from '@/app/components/MilitiaList';
import { MilitiaSearch } from '@/app/components/MilitiaSearch';
import { MilitiaProfile } from '@/app/components/MilitiaProfile';
import { UserManagement } from '@/app/components/UserManagement';
import { NewTask } from '@/app/components/NewTask';
import { TaskList } from '@/app/components/TaskList';
import { Recruitment } from '@/app/components/Recruitment';
import { Timesheet } from '@/app/components/Timesheet';
import { Payroll } from '@/app/components/Payroll';
import { GPSTracking } from '@/app/components/GPSTracking';
import { ChiTieuDashboard } from '@/app/components/ChiTieuDashboard';
import { AttendanceReport } from '@/app/components/AttendanceReport';
import { TaskReport } from '@/app/components/TaskReport';
import { CustomReport } from '@/app/components/CustomReport';
import { Approvals } from '@/app/components/Approvals';
import { ActivityLog } from '@/app/components/ActivityLog';
import { SystemConfig } from '@/app/components/SystemConfig';
import { SettingsProfile } from '@/app/components/SettingsProfile';
import { SettingsPassword } from '@/app/components/SettingsPassword';
import { SettingsSystem } from '@/app/components/SettingsSystem';
import { SettingsChiTieu } from '@/app/components/SettingsChiTieu';
import { SettingsNotifications } from '@/app/components/SettingsNotifications';
import { LoginPage } from '@/app/components/LoginPage';

interface ScreenSection {
  id: string;
  title: string;
  module: string;
  component: JSX.Element;
  description: string;
}

export function DocumentationPage() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const handlePrint = () => {
    window.print();
  };

  const toggleOrientation = () => {
    setOrientation(prev => prev === 'portrait' ? 'landscape' : 'portrait');
  };

  const toggleSection = (id: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSections(newExpanded);
  };

  const expandAll = () => {
    setExpandedSections(new Set(screens.map(s => s.id)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const screens: ScreenSection[] = [
    // Authentication
    {
      id: 'login',
      title: 'Đăng nhập',
      module: 'Xác thực',
      component: <LoginPage onLogin={() => {}} />,
      description: 'Màn hình đăng nhập hệ thống với xác thực tài khoản'
    },

    // Dashboard
    {
      id: 'dashboard',
      title: 'Trang chủ - Dashboard',
      module: '1. Dashboard',
      component: <Dashboard onNavigate={() => {}} />,
      description: 'Tổng quan hệ thống với các chỉ số quan trọng và biểu đồ thống kê'
    },

    // Quản lý Nhân sự
    {
      id: 'militia-list',
      title: 'Danh sách Dân quân Tự vệ',
      module: '2. Quản lý Nhân sự',
      component: <MilitiaList onViewProfile={() => {}} />,
      description: 'Danh sách toàn bộ dân quân tự vệ với chức năng thêm, sửa, xóa'
    },
    {
      id: 'militia-search',
      title: 'Tìm kiếm Dân quân Tự vệ',
      module: '2. Quản lý Nhân sự',
      component: <MilitiaSearch onViewProfile={() => {}} />,
      description: 'Tìm kiếm nâng cao dân quân tự vệ theo nhiều tiêu chí'
    },
    {
      id: 'militia-profile',
      title: 'Hồ sơ Dân quân Tự vệ',
      module: '2. Quản lý Nhân sự',
      component: <MilitiaProfile militiaId="1" onEdit={() => {}} onBack={() => {}} />,
      description: 'Thông tin chi tiết hồ sơ cá nhân dân quân tự vệ'
    },
    {
      id: 'user-management',
      title: 'Quản lý Người dùng',
      module: '2. Quản lý Nhân sự',
      component: <UserManagement />,
      description: 'Quản lý tài khoản người dùng hệ thống và phân quyền'
    },

    // Quản lý Giao việc
    {
      id: 'new-task',
      title: 'Tạo Công việc Mới',
      module: '3. Quản lý Giao việc',
      component: <NewTask />,
      description: 'Tạo và giao nhiệm vụ mới cho dân quân tự vệ'
    },
    {
      id: 'task-list',
      title: 'Danh sách Công việc',
      module: '3. Quản lý Giao việc',
      component: <TaskList />,
      description: 'Theo dõi và quản lý tất cả công việc đã giao'
    },

    // Tuyển dụng
    {
      id: 'recruitment',
      title: 'Tuyển dụng',
      module: '4. Tuyển dụng',
      component: <Recruitment />,
      description: 'Quản lý quy trình tuyển dụng dân quân tự vệ mới'
    },

    // Chấm công & Lương
    {
      id: 'timesheet',
      title: 'Chấm công',
      module: '5. Chấm công & Lương',
      component: <Timesheet />,
      description: 'Ghi nhận và quản lý chấm công hàng ngày'
    },
    {
      id: 'payroll',
      title: 'Tính lương',
      module: '5. Chấm công & Lương',
      component: <Payroll />,
      description: 'Tính toán và quản lý bảng lương theo tháng'
    },

    // GPS Tracking
    {
      id: 'gps-tracking',
      title: 'Tracking GPS',
      module: '6. Tracking GPS',
      component: <GPSTracking />,
      description: 'Theo dõi vị trí thời gian thực của dân quân tự vệ'
    },

    // Báo cáo & Thống kê
    {
      id: 'chitieu-dashboard',
      title: 'Dashboard Chỉ tiêu',
      module: '7. Báo cáo & Thống kê',
      component: <ChiTieuDashboard />,
      description: 'Tổng quan và theo dõi các chỉ tiêu hoàn thành'
    },
    {
      id: 'attendance-report',
      title: 'Báo cáo Chấm công',
      module: '7. Báo cáo & Thống kê',
      component: <AttendanceReport />,
      description: 'Báo cáo thống kê chấm công theo thời gian'
    },
    {
      id: 'task-report',
      title: 'Báo cáo Công việc',
      module: '7. Báo cáo & Thống kê',
      component: <TaskReport />,
      description: 'Báo cáo tiến độ và hoàn thành công việc'
    },
    {
      id: 'custom-report',
      title: 'Báo cáo Tùy chỉnh',
      module: '7. Báo cáo & Thống kê',
      component: <CustomReport />,
      description: 'Tạo báo cáo tùy chỉnh theo nhu cầu'
    },

    // Duyệt đơn từ
    {
      id: 'approvals',
      title: 'Duyệt đơn từ',
      module: '8. Duyệt đơn từ',
      component: <Approvals />,
      description: 'Quản lý và phê duyệt các đơn từ của dân quân tự vệ'
    },

    // Cài đặt
    {
      id: 'activity-log',
      title: 'Nhật ký Hoạt động',
      module: '9. Cài đặt',
      component: <ActivityLog />,
      description: 'Theo dõi lịch sử hoạt động của hệ thống'
    },
    {
      id: 'system-config',
      title: 'Cấu hình Hệ thống',
      module: '9. Cài đặt',
      component: <SystemConfig />,
      description: 'Cấu hình các thông số hệ thống'
    },
    {
      id: 'settings-profile',
      title: 'Cài đặt Hồ sơ',
      module: '9. Cài đặt',
      component: <SettingsProfile />,
      description: 'Cập nhật thông tin cá nhân người dùng'
    },
    {
      id: 'settings-password',
      title: 'Đổi Mật khẩu',
      module: '9. Cài đặt',
      component: <SettingsPassword />,
      description: 'Thay đổi mật khẩu đăng nhập'
    },
    {
      id: 'settings-system',
      title: 'Cài đặt Hệ thống',
      module: '9. Cài đặt',
      component: <SettingsSystem />,
      description: 'Cấu hình tùy chọn hệ thống'
    },
    {
      id: 'settings-chitieu',
      title: 'Cài đặt Chỉ tiêu',
      module: '9. Cài đặt',
      component: <SettingsChiTieu />,
      description: 'Thiết lập và quản lý các chỉ tiêu'
    },
    {
      id: 'settings-notifications',
      title: 'Cài đặt Thông báo',
      module: '9. Cài đặt',
      component: <SettingsNotifications />,
      description: 'Quản lý tùy chọn thông báo'
    }
  ];

  // Group screens by module
  const groupedScreens = screens.reduce((acc, screen) => {
    if (!acc[screen.module]) {
      acc[screen.module] = [];
    }
    acc[screen.module].push(screen);
    return acc;
  }, {} as Record<string, ScreenSection[]>);

  return (
    <div className="min-h-screen bg-white">
      {/* Print Header - Only visible when printing */}
      <div className="print-only text-center py-4 border-b-2 border-[#1F3A5F]">
        <h1 className="text-2xl font-bold text-[#1F3A5F]">HỆ THỐNG QUẢN LÝ DÂN QUÂN TỰ VỆ</h1>
        <p className="text-sm text-gray-600 mt-1">UBND Phường Phú Định - TP. Hồ Chí Minh</p>
        <p className="text-xs text-gray-500 mt-1">Tài liệu hướng dẫn sử dụng - Phiên bản 5.0</p>
      </div>

      {/* Screen Header - Hidden when printing */}
      <div className="no-print sticky top-0 z-50 bg-white border-b-2 border-[#1F3A5F] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1F3A5F] flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#1F3A5F]">
                  Tài liệu Hệ thống
                </h1>
                <p className="text-sm text-gray-600">
                  Tổng hợp toàn bộ {screens.length} màn hình
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="px-4 py-2 text-sm border border-[#1F3A5F] text-[#1F3A5F] rounded-lg hover:bg-gray-50 transition-colors"
              >
                Mở tất cả
              </button>
              <button
                onClick={collapseAll}
                className="px-4 py-2 text-sm border border-[#1F3A5F] text-[#1F3A5F] rounded-lg hover:bg-gray-50 transition-colors"
              >
                Thu tất cả
              </button>
              <button
                onClick={handlePrint}
                className="px-6 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5a8f] transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                In PDF
              </button>
              <button
                onClick={toggleOrientation}
                className="px-4 py-2 text-sm border border-[#1F3A5F] text-[#1F3A5F] rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Monitor className="w-4 h-4" />
                {orientation === 'portrait' ? 'Landscape' : 'Portrait'}
              </button>
              <button
                className="px-4 py-2 text-sm border border-[#1F3A5F] text-[#1F3A5F] rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <ZoomIn className="w-4 h-4" />
                Phóng to
              </button>
              <button
                className="px-4 py-2 text-sm border border-[#1F3A5F] text-[#1F3A5F] rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <ZoomOut className="w-4 h-4" />
                Thu nhỏ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions - Hidden when printing */}
      <div className="no-print max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-blue-900">Hướng dẫn in PDF:</h3>
            <div className="bg-blue-100 px-3 py-1 rounded-lg">
              <span className="text-sm font-semibold text-blue-900">
                Độ phóng to khi in: 100%
              </span>
            </div>
          </div>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Click nút "Mở tất cả" để hiển thị toàn bộ màn hình</li>
            <li>Chọn chế độ Portrait hoặc Landscape phù hợp</li>
            <li>Click nút "In PDF" ở trên</li>
            <li>Trong cửa sổ in, chọn "Save as PDF" hoặc "In thành PDF"</li>
            <li>Chọn định dạng giấy A4, và orientation tương ứng</li>
            <li>Click "Lưu" hoặc "Save" để xuất file PDF</li>
          </ol>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {Object.entries(groupedScreens).map(([moduleName, moduleScreens]) => (
          <div key={moduleName} className="mb-12">
            {/* Module Header */}
            <div className="no-print mb-6 pb-3 border-b-2 border-[#1F3A5F]">
              <h2 className="text-2xl font-bold text-[#1F3A5F]">{moduleName}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {moduleScreens.length} màn hình
              </p>
            </div>

            {/* Screens in Module */}
            <div className="space-y-8">
              {moduleScreens.map((screen, index) => {
                const isExpanded = expandedSections.has(screen.id);
                
                return (
                  <div key={screen.id}>
                    {/* Screen view mode - No print */}
                    <div className="no-print">
                      <div 
                        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors"
                        onClick={() => toggleSection(screen.id)}
                      >
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {index + 1}. {screen.title}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">{screen.description}</p>
                        </div>
                        <button className="ml-4 p-2 hover:bg-gray-100 rounded-lg">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-600" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                      </div>

                      {/* Screen Content - View mode */}
                      {isExpanded && (
                        <div className="border-2 border-gray-200 rounded-lg overflow-hidden shadow-sm mt-4 mb-4">
                          <div className="scale-90 origin-top-left w-[111.11%]">
                            {screen.component}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Print mode - Always render for all screens */}
                    <div className="print-page-screen">
                      <div className="print-screen-header">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {screen.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">{screen.description}</p>
                        <p className="text-xs text-gray-500">Module: {screen.module}</p>
                      </div>
                      <div className="print-screen-content">
                        {screen.component}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="print-only text-center py-4 border-t-2 border-gray-300 mt-12">
        <p className="text-xs text-gray-600">
          © 2024 UBND Phường Phú Định - Hệ thống Quản lý Dân quân Tự vệ
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Tài liệu này chỉ dành cho nội bộ sử dụng
        </p>
      </div>

      {/* Print Styles */}
      <style>{`
        /* Hide print elements on screen */
        @media screen {
          .print-page-screen {
            display: none !important;
          }
        }
        
        @media print {
          /* Hide screen elements */
          .no-print {
            display: none !important;
          }
          
          /* Show print elements */
          .print-only {
            display: block !important;
          }
          
          .print-page-screen {
            display: block !important;
            page-break-after: always;
            page-break-inside: avoid;
            width: 100%;
            height: 100vh;
            position: relative;
            overflow: hidden;
            padding: 0;
            margin: 0;
          }
          
          .print-screen-header {
            padding: 8px 0;
            border-bottom: 2px solid #e5e7eb;
            margin-bottom: 10px;
          }
          
          .print-screen-header h3 {
            font-size: 14px;
            margin-bottom: 4px;
          }
          
          .print-screen-header p {
            font-size: 11px;
          }
          
          .print-screen-content {
            width: 100%;
            height: calc(100vh - 80px);
            overflow: hidden;
            position: relative;
            display: flex;
            align-items: flex-start;
            justify-content: center;
          }
          
          .print-screen-content > div {
            transform: scale(${orientation === 'portrait' ? '0.48' : '0.65'});
            transform-origin: top center;
            width: ${orientation === 'portrait' ? '208%' : '154%'};\n            overflow: hidden;\n          }
          
          body {
            background: white !important;
          }
          
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
          }
          
          @page {
            margin: 1.5cm;
            size: A4 ${orientation};
          }
          
          /* Ensure components fit within page */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}