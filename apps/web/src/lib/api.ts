const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// ---------------------------------------------------------------------------
// Token helpers — centralised localStorage + cookie access
// ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  // Cookie for Next.js middleware (SSR route protection).
  // Use short max-age aligned with JWT expiry (15 min = 900s) + small buffer.
  document.cookie = `accessToken=${accessToken}; path=/; max-age=960; SameSite=Lax`;
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  document.cookie = 'accessToken=; path=/; max-age=0';
}

// ---------------------------------------------------------------------------
// Refresh lock — prevents concurrent refresh requests
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const data = json.data ?? json;

    if (data?.accessToken && data?.refreshToken) {
      saveTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempts a single token refresh. Uses a lock so that concurrent 401s
 * don't trigger multiple refresh requests.
 */
async function tryRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

interface FetchOptions extends RequestInit {
  /** Explicit token override — when omitted the client reads localStorage. */
  token?: string;
  /** Skip automatic token attachment (e.g. for login/register calls). */
  noAuth?: boolean;
}

export async function api<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, noAuth, headers: customHeaders, ...rest } = options;

  const buildHeaders = (authToken?: string | null): Record<string, string> => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      ...Object.fromEntries(
        Object.entries(customHeaders || {}).filter(
          ([, v]) => typeof v === 'string',
        ),
      ),
    };
    if (authToken) {
      h['Authorization'] = `Bearer ${authToken}`;
    }
    return h;
  };

  // Resolve the token to use: explicit > localStorage > none
  const resolvedToken = token ?? (noAuth ? null : getAccessToken());
  const headers = buildHeaders(resolvedToken);

  let response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...rest,
  });

  // --- Automatic refresh on 401 -------------------------------------------
  if (response.status === 401 && !noAuth) {
    const newToken = await tryRefresh();
    if (newToken) {
      // Retry the original request with the fresh token
      const retryHeaders = buildHeaders(newToken);
      response = await fetch(`${API_BASE}${path}`, {
        headers: retryHeaders,
        ...rest,
      });
    } else {
      // Refresh failed — clear tokens and redirect to login
      clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      }
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Token was refreshed but still 401 — the refresh token is also invalid
      clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      }
      throw new Error('Session expired');
    }
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}
