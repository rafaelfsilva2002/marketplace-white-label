'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getAccessToken, saveTokens, clearTokens } from '@/lib/api';

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
    const token = getAccessToken();
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
      clearTokens();
    }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    router.replace('/login');
  }, [router]);

  const setTokensAndUser = useCallback((access: string, refresh: string) => {
    saveTokens(access, refresh);
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

  return { user, loading, logout, setTokens: setTokensAndUser, isAuthenticated: !!user };
}
