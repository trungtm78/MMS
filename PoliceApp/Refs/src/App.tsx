import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import DQTVList from './components/DQTVList';
import GPSTracking from './components/GPSTracking';
import CreateTask from './components/CreateTask';
import TaskDetail from './components/TaskDetail';
import Attendance from './components/Attendance';
import ChiTieuEvaluation from './components/ChiTieuEvaluation';
import Reports from './components/Reports';
import ApproveRequests from './components/ApproveRequests';
import Alerts from './components/Alerts';
import Profile from './components/Profile';
import { Home, Users, MapPin, ClipboardList, User } from 'lucide-react';
import BottomNav from './components/BottomNav';
import type { ScreenCA as Screen } from './types/app';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');

  // Check login state from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('cakv_user');
    if (savedUser) {
      setIsLoggedIn(true);
      setCurrentUser(savedUser);
    }
  }, []);

  const handleLogin = (username: string, password: string) => {
    // In production, this would validate credentials with backend
    localStorage.setItem('cakv_user', username);
    setCurrentUser(username);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('cakv_user');
    setCurrentUser('');
    setIsLoggedIn(false);
    setCurrentScreen('dashboard');
  };

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentScreen} />;
      case 'dqtv':
        return <DQTVList onNavigate={setCurrentScreen} />;
      case 'map':
        return <GPSTracking onNavigate={setCurrentScreen} />;
      case 'tasks':
        return <CreateTask onNavigate={setCurrentScreen} />;
      case 'profile':
        return <Profile onNavigate={setCurrentScreen} onLogout={handleLogout} />;
      case 'approvals':
        return <ApproveRequests onNavigate={setCurrentScreen} />;
      case 'reports':
        return <Reports onNavigate={setCurrentScreen} />;
      case 'alerts':
        return <Alerts onNavigate={setCurrentScreen} />;
      default:
        return <Dashboard onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16">
      {renderScreen()}

      {/* Bottom Navigation */}
      <BottomNav
        items={[
          { key: 'dashboard', label: 'Trang chủ', Icon: Home },
          { key: 'dqtv', label: 'DQTV', Icon: Users },
          { key: 'map', label: 'Bản đồ', Icon: MapPin },
          { key: 'tasks', label: 'Nhiệm vụ', Icon: ClipboardList },
          { key: 'profile', label: 'Cá nhân', Icon: User },
        ]}
        activeKey={currentScreen}
        onChange={setCurrentScreen}
        navClassName="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-around px-4 z-50"
        wrapperClassName="flex items-center justify-around w-full"
        activeTextClassName="text-[#366092]"
        inactiveTextClassName="text-[#94A3B8]"
      />

</div>
  );
}