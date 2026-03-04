import { useState } from 'react';
import { DEFAULT_SCREEN, type ScreenId } from '@/app/types/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Header } from '@/app/components/Header';
import { Sidebar } from '@/app/components/Sidebar';
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
import { Chatbot } from '@/app/components/Chatbot';
import { QuickActions } from '@/app/components/QuickActions';
import { LoginPage } from '@/app/components/LoginPage';
import { DocumentationPage } from '@/app/components/DocumentationPage';
import { GlobalFooter } from '@/app/components/GlobalFooter';

function AppContent() {
  const { isAuthenticated, logout } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(DEFAULT_SCREEN);
  const [selectedMilitiaId, setSelectedMilitiaId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // If not logged in, show login page
  if (!isAuthenticated) {
    return <LoginPage onLogin={() => {}} />;
  }

  const handleLogout = () => {
    logout();
    setCurrentScreen(DEFAULT_SCREEN);
    setSelectedMilitiaId(null);
  };

  const handleNavigate = (screen: ScreenId) => {
    setCurrentScreen(screen);
    if (screen !== 'militia-profile') {
      setSelectedMilitiaId(null);
    }
    setIsMobileMenuOpen(false);
    
    // Track usage statistics
    try {
      const usageStats = JSON.parse(localStorage.getItem('screenUsageStats') || '{}');
      usageStats[screen] = (usageStats[screen] || 0) + 1;
      localStorage.setItem('screenUsageStats', JSON.stringify(usageStats));
    } catch (error) {
      console.error('Error tracking usage:', error);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleViewProfile = (id: string) => {
    setSelectedMilitiaId(id);
    setCurrentScreen('militia-profile');
  };

  const handleEditMilitia = (id: string) => {
    // Edit is now handled within MilitiaList modal
    // Just navigate back to list
    setCurrentScreen('militia-list');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      
      // Documentation
      case 'documentation':
        return <DocumentationPage />;
      
      // Quản lý nhân sự
      case 'militia-list':
        return <MilitiaList onViewProfile={handleViewProfile} />;
      case 'militia-search':
        return <MilitiaSearch onViewProfile={handleViewProfile} />;
      case 'militia-profile':
        return <MilitiaProfile militiaId={selectedMilitiaId} onEdit={handleEditMilitia} onBack={() => handleNavigate('militia-search')} />;
      case 'user-management':
        return <UserManagement />;
      
      // Quản lý giao việc
      case 'new-task':
        return <NewTask />;
      case 'task-list':
        return <TaskList />;
      
      // Tuyển dụng
      case 'recruitment':
        return <Recruitment />;
      
      // Chấm công & Lương
      case 'timesheet':
        return <Timesheet />;
      case 'payroll':
      case 'payroll-calculate':
      case 'payroll-list':
        return <Payroll />;      
      // GPS Tracking
      case 'gps-tracking':
        return <GPSTracking />;
      
      // Báo cáo & Thống kê
      case 'reports':
      case 'chitieu-dashboard':
        return <ChiTieuDashboard />;
      case 'attendance-report':
        return <AttendanceReport />;
      case 'task-report':
        return <TaskReport />;
      case 'custom-report':
        return <CustomReport />;
      
      // Duyệt đơn từ
      case 'approvals':
        return <Approvals />;
      
      // System & Settings
      case 'activity-log':
        return <ActivityLog />;
      case 'settings-profile':
        return <SettingsProfile />;
      case 'settings-password':
        return <SettingsPassword />;
      case 'settings-system':
        return <SettingsSystem />;
      case 'settings-chitieu':
        return <SettingsChiTieu />;
      case 'settings-notifications':
        return <SettingsNotifications />;
      case 'system-config':
        return <SystemConfig />;
      
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      <Sidebar currentScreen={currentScreen} onNavigate={handleNavigate} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isMobileMenuOpen ? 'lg:ml-0' : ''}`}>
        <Header onLogout={handleLogout} onToggleMobileMenu={toggleMobileMenu} />
        <main className="flex-1 overflow-y-auto pt-20 lg:ml-64 flex flex-col">
          <div className="flex-1">
            {renderScreen()}
          </div>
          <GlobalFooter />
        </main>
      </div>
      <Chatbot />
      <QuickActions />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}