import { storage } from './storage';
import type { ApiResponse } from '@marketplace/shared';

const API_BASE = __DEV__
  ? 'http://10.0.2.2:3001/api/v1'
  : 'https://api.marketplace.com/api/v1';

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  noAuth?: boolean;
};

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void) {
  onUnauthorized = callback;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const json: ApiResponse<{ accessToken: string; refreshToken: string; expiresIn: number }> = await res.json();

    if (json.success && json.data) {
      await storage.setAccessToken(json.data.accessToken);
      await storage.setRefreshToken(json.data.refreshToken);
      return json.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, noAuth = false } = options;

  if (!noAuth) {
    const token = await storage.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  headers['Content-Type'] = headers['Content-Type'] || 'application/json';

  const url = `${API_BASE}${path}`;
  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !noAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } else {
      await storage.clearTokens();
      onUnauthorized?.();
      throw new ApiError('Session expired', 401);
    }
  }

  const json: ApiResponse<T> = await res.json();

  if (!json.success || json.error) {
    throw new ApiError(json.error?.message || 'Request failed', res.status, json.error?.code);
  }

  return json.data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}
