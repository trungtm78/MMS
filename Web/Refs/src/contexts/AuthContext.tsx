import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, authenticateUser, getUserById } from '@/data/mockData';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUserId = localStorage.getItem('dqtv_user_id');
    if (savedUserId) {
      const loadedUser = getUserById(parseInt(savedUserId));
      if (loadedUser) {
        setUser(loadedUser);
      }
    }
  }, []);

  const login = (username: string, password: string): boolean => {
    const authenticatedUser = authenticateUser(username, password);
    
    if (authenticatedUser) {
      setUser(authenticatedUser);
      // Save to localStorage
      localStorage.setItem('dqtv_user_id', authenticatedUser.id.toString());
      localStorage.setItem('dqtv_username', authenticatedUser.username);
      return true;
    }
    
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('dqtv_user_id');
    localStorage.removeItem('dqtv_username');
  };

  const isAuthenticated = user !== null;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
