import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('tintoreria_auth') === 'true';
  });

  const login = useCallback(() => {
    setIsAuthenticated(true);
    localStorage.setItem('tintoreria_auth', 'true');
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    localStorage.removeItem('tintoreria_auth');
  }, []);

  const value = useMemo<AuthContextType>(() => ({ isAuthenticated, login, logout }), [
    isAuthenticated,
    login,
    logout,
  ]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
