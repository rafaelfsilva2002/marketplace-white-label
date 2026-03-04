'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }
    // Decode JWT payload (no verification, just for display)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser({
        id: payload.sub,
        email: payload.email,
        name: payload.name || null,
        role: payload.role,
      });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    document.cookie = 'accessToken=; path=/; max-age=0';
    setUser(null);
    router.replace('/login');
  }, [router]);

  const setTokens = useCallback((access: string, refresh: string) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    // Also set cookie for middleware SSR access
    document.cookie = `accessToken=${access}; path=/; max-age=86400; SameSite=Lax`;
    // Decode and set user
    try {
      const payload = JSON.parse(atob(access.split('.')[1]));
      setUser({
        id: payload.sub,
        email: payload.email,
        name: payload.name || null,
        role: payload.role,
      });
    } catch {
      /* ignore decode errors */
    }
  }, []);

  return { user, loading, logout, setTokens, isAuthenticated: !!user };
}
