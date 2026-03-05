import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/services/storage';
import { api, setOnUnauthorized } from '@/services/api';
import type { UserRole } from '@marketplace/shared';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isVerified: boolean | null;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const clearAuth = useCallback(async () => {
    await storage.clearTokens();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => clearAuth());
  }, [clearAuth]);

  useEffect(() => {
    (async () => {
      const token = await storage.getAccessToken();
      if (!token) {
        setState({ user: null, isLoading: false, isAuthenticated: false });
        return;
      }
      try {
        const user = await api<User>('/auth/me');
        setState({ user, isLoading: false, isAuthenticated: true });
      } catch {
        await clearAuth();
      }
    })();
  }, [clearAuth]);

  const login = async (email: string, password: string) => {
    const res = await api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      noAuth: true,
    });
    await storage.setAccessToken(res.accessToken);
    await storage.setRefreshToken(res.refreshToken);
    setState({ user: res.user, isLoading: false, isAuthenticated: true });
  };

  const register = async (data: RegisterInput) => {
    const res = await api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: data,
      noAuth: true,
    });
    await storage.setAccessToken(res.accessToken);
    await storage.setRefreshToken(res.refreshToken);
    setState({ user: res.user, isLoading: false, isAuthenticated: true });
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout failure
    }
    await clearAuth();
  };

  const refreshUser = async () => {
    const user = await api<User>('/auth/me');
    setState((s) => ({ ...s, user }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
