import { 
  LayoutDashboard, 
  Users, 
  Search,
  UserCog, 
  Briefcase,
  UserPlus,
  ClipboardList,
  MapPin,
  BarChart3,
  CheckSquare,
  Settings,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileSpreadsheet,
  Target,
  ClipboardCheck,
  FileText,
  Plus,
  List,
  Shield,
  Activity,
  History,
  Calendar,
  Calculator,
  Receipt,
  TrendingUp,
  FileCheck,
  FilePlus,
  Award,
  User,
  Lock,
  Wrench,
  Bell,
  X,
  BookOpen
} from 'lucide-react';
import { useState } from 'react';
import type { ScreenId } from '@/app/types/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getMenuForRole, MenuItem } from '@/config/menuConfig';

interface SidebarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// Icon mapping
const iconMap: Record<string, any> = {
  LayoutDashboard,
  Users,
  Search,
  UserCog,
  Briefcase,
  UserPlus,
  ClipboardList,
  MapPin,
  BarChart3,
  CheckSquare,
  Settings,
  Target,
  ClipboardCheck,
  FileText,
  Plus,
  List,
  Shield,
  Activity,
  History,
  Calendar,
  Calculator,
  Receipt,
  TrendingUp,
  FileCheck,
  FilePlus,
  Award,
  User,
  Lock,
  Wrench,
  Bell,
  Clock,
  DollarSign,
  FileSpreadsheet,
  BookOpen
};

export function Sidebar({ currentScreen, onNavigate, isOpen = true, onClose }: SidebarProps) {
  const { user } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    personnel: true,
    tasks: false,
    'my-tasks': false,
    attendance: false,
    reports: false,
    approvals: false,
    'my-requests': false,
    settings: false,
  });

  // Get filtered menu based on user role
  const menuItems = user ? getMenuForRole(user.role) : [];

  const toggleMenu = (menuId: string) => {
    setOpenMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  const handleNavigate = (screen: ScreenId) => {
    onNavigate(screen);
    // Close mobile menu after navigation
    if (onClose) {
      onClose();
    }
  };

  const renderMenuItem = (item: MenuItem, depth: number = 0) => {
    const Icon = iconMap[item.icon] || Users;
    const hasChildren = item.children && item.children.length > 0;
    const isOpenMenu = openMenus[item.id];
    const isActive = item.screen === currentScreen;

    if (hasChildren) {
      return (
        <div key={item.id} className={depth === 0 ? 'mb-1' : ''}>
          <button
            onClick={() => toggleMenu(item.id)}
            className={`w-full flex items-center justify-between px-4 py-2.5 font-medium transition-colors ${
              depth === 0
                ? 'text-white hover:bg-[#236127] rounded-lg'
                : 'text-gray-200 hover:bg-[#236127] rounded-md ml-3'
            }`}
          >
            <div className="flex items-center gap-3">
              <Icon size={18} className={depth === 0 ? 'text-white' : 'text-gray-200'} />
              <span>{item.label}</span>
            </div>
            <ChevronDown 
              size={16} 
              className={`transition-transform text-white ${isOpenMenu ? 'rotate-180' : ''}`}
            />
          </button>
          
          {isOpenMenu && item.children && (
            <div className="ml-4 mt-1 space-y-1">
              {item.children.map(child => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => item.screen && handleNavigate(item.screen)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 font-medium transition-colors rounded-lg ${
          isActive
            ? 'bg-[#F4F269] text-[#C62828]'
            : 'text-white hover:bg-[#236127] ml-3'
        }`}
      >
        <Icon size={18} className={isActive ? 'text-[#C62828]' : 'text-white'} />
        <span className="flex-1 text-left">{item.label}</span>
        {item.badge && (
          <span className="px-2 py-0.5 text-xs font-semibold bg-[#C62828] text-white rounded-full">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && onClose && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-20 w-64 h-[calc(100vh-5rem)] bg-[#2E7D32] border-r border-[#1F5F23] overflow-y-auto shadow-lg z-50
        transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile Close Button */}
        {onClose && (
          <div className="lg:hidden sticky top-0 bg-[#2E7D32] border-b border-[#1F5F23] p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Menu</span>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center hover:bg-[#236127] rounded-lg transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
        )}

        <nav className="p-4">
          {menuItems.length > 0 ? (
            menuItems.map(item => renderMenuItem(item))
          ) : (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-gray-500">Không có menu khả dụng</p>
            </div>
          )}
        </nav>
        
        {/* Role indicator */}
        {user && (
          <div className="p-4 border-t border-[#1F5F23] bg-[#1F5F23] sticky bottom-0">
            <div className="text-xs text-gray-300 mb-1">Vai trò</div>
            <div className="text-sm font-medium text-white">{user.position || user.fullName}</div>
          </div>
        )}
      </aside>
    </>
  );
}
