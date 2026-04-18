import { useState } from 'react';
import { Login } from './components/Login';
import { Home } from './components/Home';
import { MyTasks } from './components/MyTasks';
import { CheckIn } from './components/CheckIn';
import { KPI } from './components/KPI';
import { Profile } from './components/Profile';
import { TaskReport } from './components/TaskReport';
import { Documentation } from './components/Documentation';
import { Home as HomeIcon, ClipboardList, MapPin, BarChart3, User, FileText } from 'lucide-react';

type TabType = 'home' | 'tasks' | 'checkin' | 'kpi' | 'profile';
type ScreenType = 'main' | 'report' | 'documentation';

interface UserData {
  username: string;
  name: string;
  code: string;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('main');
  const [showDocumentation, setShowDocumentation] = useState(false);

  const handleLogin = (role: 'dqtv' | 'police', data: UserData) => {
    setUserData(data);
    setIsLoggedIn(true);
    setActiveTab('home');
    setCurrentScreen('main');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserData(null);
    setActiveTab('home');
    setCurrentScreen('main');
  };

  const handleOpenReport = () => {
    setCurrentScreen('report');
  };

  const handleBackFromReport = () => {
    setCurrentScreen('main');
  };

  const handleBackToHome = () => {
    setActiveTab('home');
  };

  // Show documentation
  if (showDocumentation) {
    return <Documentation />;
  }

  // Show login screen if not logged in
  if (!isLoggedIn || !userData) {
    return (
      <div className="relative">
        <Login onLogin={handleLogin} />
        {/* Documentation button for demo */}
        <button
          onClick={() => setShowDocumentation(true)}
          className="fixed top-4 right-4 z-50 p-3 bg-[#366092] text-white rounded-full shadow-lg hover:bg-[#2a4d73] transition-colors"
          title="Xem tài liệu"
        >
          <FileText className="w-6 h-6" />
        </button>
      </div>
    );
  }

  // Show Task Report screen
  if (currentScreen === 'report') {
    return <TaskReport onBack={handleBackFromReport} />;
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <Home onOpenReport={handleOpenReport} onSwitchTab={setActiveTab} />;
      case 'tasks':
        return <MyTasks onBack={handleBackToHome} />;
      case 'checkin':
        return <CheckIn onBack={handleBackToHome} />;
      case 'kpi':
        return <KPI onBack={handleBackToHome} />;
      case 'profile':
        return <Profile onLogout={handleLogout} onBack={handleBackToHome} />;
      default:
        return <Home onOpenReport={handleOpenReport} onSwitchTab={setActiveTab} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] max-w-md mx-auto relative">
      {/* Screen Content */}
      <div className="flex-1 overflow-y-auto pb-16">
        {renderScreen()}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 h-16 flex items-center justify-around px-2 z-50">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'home' ? 'text-[#366092]' : 'text-[#64748B]'
          }`}
        >
          <HomeIcon className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">Trang chủ</span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
            activeTab === 'tasks' ? 'text-[#366092]' : 'text-[#64748B]'
          }`}
        >
          <ClipboardList className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">Nhiệm vụ</span>
          <span className="absolute top-2 right-6 w-5 h-5 bg-[#EF4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            3
          </span>
        </button>

        <button
          onClick={() => setActiveTab('checkin')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'checkin' ? 'text-[#366092]' : 'text-[#64748B]'
          }`}
        >
          <MapPin className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">Điểm danh</span>
        </button>

        <button
          onClick={() => setActiveTab('kpi')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'kpi' ? 'text-[#366092]' : 'text-[#64748B]'
          }`}
        >
          <BarChart3 className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">Chỉ tiêu</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            activeTab === 'profile' ? 'text-[#366092]' : 'text-[#64748B]'
          }`}
        >
          <User className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">Cá nhân</span>
        </button>
      </nav>
    </div>
  );
}