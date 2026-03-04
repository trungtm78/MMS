import { useState } from 'react';
import { FileText } from 'lucide-react';

import { BottomNav } from './components/BottomNav';
import { CheckIn } from './components/CheckIn';
import { Documentation } from './components/Documentation';
import { Home } from './components/Home';
import { KPI } from './components/KPI';
import { Login } from './components/Login';
import { MyTasks } from './components/MyTasks';
import { Profile } from './components/Profile';
import { TaskReport } from './components/TaskReport';

import type { ScreenType, TabType, UserData } from './types/app';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('main');
  const [showDocumentation, setShowDocumentation] = useState(false);

  const handleLogin = (_role: 'dqtv' | 'police', data: UserData) => {
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
      <div className="flex-1 overflow-y-auto pb-16">{renderScreen()}</div>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  );
}