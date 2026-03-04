import { useState, useEffect } from 'react';
import LoginDQTV from './components/dqtv/LoginDQTV';
import DashboardDQTV from './components/dqtv/DashboardDQTV';
import MyTasks from './components/dqtv/MyTasks';
import CheckIn from './components/dqtv/CheckIn';
import ReportWork from './components/dqtv/ReportWork';
import ProfileDQTV from './components/dqtv/ProfileDQTV';
import { Home, ClipboardList, Clock, FileText, User } from 'lucide-react';
import BottomNav from './components/BottomNav';
import type { ScreenDQTV as Screen } from './types/app';

export default function MobileAppDQTV() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');

  // Check login state from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('dqtv_user');
    if (savedUser) {
      setIsLoggedIn(true);
      setCurrentUser(savedUser);
    }
  }, []);

  const handleLogin = (username: string, password: string) => {
    localStorage.setItem('dqtv_user', username);
    setCurrentUser(username);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('dqtv_user');
    setCurrentUser('');
    setIsLoggedIn(false);
    setCurrentScreen('dashboard');
  };

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return <LoginDQTV onLogin={handleLogin} />;
  }

  // Render current screen
  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <DashboardDQTV onNavigate={setCurrentScreen} currentUser={currentUser} />;
      case 'tasks':
        return <MyTasks onNavigate={setCurrentScreen} />;
      case 'checkin':
        return <CheckIn onNavigate={setCurrentScreen} />;
      case 'report':
        return <ReportWork onNavigate={setCurrentScreen} />;
      case 'profile':
        return <ProfileDQTV onNavigate={setCurrentScreen} onLogout={handleLogout} currentUser={currentUser} />;
      default:
        return <DashboardDQTV onNavigate={setCurrentScreen} currentUser={currentUser} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {renderScreen()}

      {/* Bottom Navigation */}
      <BottomNav
        items={[
          { key: 'dashboard', label: 'Trang chủ', Icon: Home },
          { key: 'tasks', label: 'Nhiệm vụ', Icon: ClipboardList },
          { key: 'checkin', label: 'Chấm công', Icon: Clock },
          { key: 'report', label: 'Báo cáo', Icon: FileText },
          { key: 'profile', label: 'Cá nhân', Icon: User },
        ]}
        activeKey={currentScreen}
        onChange={setCurrentScreen}
        navClassName="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-2 py-2 z-50"
        wrapperClassName="flex items-center justify-around max-w-md mx-auto"
        activeTextClassName="text-[#366092]"
        inactiveTextClassName="text-[#64748B]"
        iconSize={22}
      />

</div>
  );
}
