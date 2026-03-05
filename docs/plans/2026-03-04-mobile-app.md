# Mobile App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Expo React Native mobile app for both clients and professionals, sharing types with the existing API.

**Architecture:** Expo managed workflow inside `apps/mobile/`. Shares `packages/shared` (types, DTOs, enums). NativeWind for styling, React Navigation for routing, TanStack Query for data fetching. Secure token storage via expo-secure-store.

**Tech Stack:** Expo ~52, React Navigation v7, NativeWind v4, TanStack Query v5, expo-secure-store, react-hook-form + zod

---

## Task 1: Scaffold Expo Project in Monorepo

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/index.ts`
- Create: `apps/mobile/src/App.tsx`

**Step 1: Create Expo project**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM"
npx create-expo-app@latest apps/mobile --template blank-typescript
```

**Step 2: Configure package.json for monorepo**

Replace `apps/mobile/package.json` name to `@marketplace/mobile` and add workspace dependency:

```json
{
  "name": "@marketplace/mobile",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@marketplace/shared": "workspace:*",
    "expo": "~52.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.6"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/react": "~18.3.12",
    "typescript": "~5.3.3"
  }
}
```

**Step 3: Configure tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Configure metro for monorepo**

Create `apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

**Step 5: Create entry point**

`apps/mobile/index.ts`:
```ts
import { registerRootComponent } from 'expo';
import App from './src/App';
registerRootComponent(App);
```

`apps/mobile/src/App.tsx`:
```tsx
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Marketplace FTM</Text>
      <StatusBar style="auto" />
    </View>
  );
}
```

**Step 6: Install deps and verify**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM"
pnpm install
cd apps/mobile && npx expo start --no-dev --minify
```

Expected: App launches with "Marketplace FTM" text.

**Step 7: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): scaffold Expo project in monorepo"
```

---

## Task 2: Configure NativeWind + Theme

**Files:**
- Create: `apps/mobile/tailwind.config.js`
- Create: `apps/mobile/global.css`
- Create: `apps/mobile/nativewind-env.d.ts`
- Modify: `apps/mobile/babel.config.js`
- Modify: `apps/mobile/metro.config.js`
- Create: `apps/mobile/src/lib/theme.ts`

**Step 1: Install NativeWind deps**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx expo install nativewind tailwindcss react-native-reanimated react-native-safe-area-context
```

**Step 2: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        background: '#ffffff',
        foreground: '#0a0a0a',
        muted: '#f5f5f5',
        'muted-foreground': '#737373',
        border: '#e5e5e5',
      },
    },
  },
  plugins: [],
};
```

**Step 3: Create global.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 4: Update babel.config.js**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

**Step 5: Update metro.config.js**

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });
```

**Step 6: Create nativewind-env.d.ts**

```ts
/// <reference types="nativewind/types" />
```

**Step 7: Create theme.ts**

```ts
export const colors = {
  primary: '#ef4444',
  primaryDark: '#dc2626',
  background: '#ffffff',
  foreground: '#0a0a0a',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  border: '#e5e5e5',
  success: '#22c55e',
  warning: '#f59e0b',
  destructive: '#ef4444',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
```

**Step 8: Update App.tsx to use NativeWind**

```tsx
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-xl font-bold text-foreground">Marketplace FTM</Text>
      <StatusBar style="auto" />
    </View>
  );
}
```

**Step 9: Verify NativeWind works**

```bash
npx expo start --clear
```

Expected: Text centered with correct colors.

**Step 10: Commit**

```bash
git add -A apps/mobile/
git commit -m "feat(mobile): configure NativeWind + theme"
```

---

## Task 3: API Client + Secure Storage

**Files:**
- Create: `apps/mobile/src/services/storage.ts`
- Create: `apps/mobile/src/services/api.ts`
- Create: `apps/mobile/src/services/__tests__/api.test.ts`

**Step 1: Install deps**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx expo install expo-secure-store
pnpm add -D jest @testing-library/react-native @types/jest jest-expo
```

Add to package.json:
```json
"jest": {
  "preset": "jest-expo",
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"
  ]
}
```

**Step 2: Create storage.ts**

```ts
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
} as const;

export const storage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  },

  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  },
};
```

**Step 3: Create api.ts**

```ts
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

    const json: ApiResponse<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }> = await res.json();

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

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
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

  // Auto-refresh on 401
  if (res.status === 401 && !noAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      await storage.clearTokens();
      onUnauthorized?.();
      throw new ApiError('Session expired', 401);
    }
  }

  const json: ApiResponse<T> = await res.json();

  if (!json.success || json.error) {
    throw new ApiError(
      json.error?.message || 'Request failed',
      res.status,
      json.error?.code,
    );
  }

  return json.data as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

**Step 4: Write test**

```ts
// apps/mobile/src/services/__tests__/api.test.ts
import { ApiError } from '../api';

describe('ApiError', () => {
  it('creates error with status and code', () => {
    const err = new ApiError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('ApiError');
  });
});
```

**Step 5: Run test**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx jest --passWithNoTests
```

**Step 6: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): add API client with token refresh + secure storage"
```

---

## Task 4: Auth Hook + Context

**Files:**
- Create: `apps/mobile/src/hooks/useAuth.ts`
- Create: `apps/mobile/src/contexts/AuthContext.tsx`

**Step 1: Install deps**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
pnpm add @tanstack/react-query
```

**Step 2: Create AuthContext.tsx**

```tsx
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
```

**Step 3: Create useApi hook**

Create `apps/mobile/src/hooks/useApi.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { PaginatedResult } from '@marketplace/shared';

export function useApiQuery<T>(key: string[], path: string, options?: { enabled?: boolean; staleTime?: number }) {
  return useQuery({
    queryKey: key,
    queryFn: () => api<T>(path),
    enabled: options?.enabled,
    staleTime: options?.staleTime ?? 30_000,
  });
}

export function useApiPaginated<T>(key: string[], path: string, page = 1, limit = 20) {
  return useQuery({
    queryKey: [...key, page, limit],
    queryFn: () => api<PaginatedResult<T>>(`${path}?page=${page}&limit=${limit}`),
    staleTime: 30_000,
  });
}

export function useApiMutation<TInput, TOutput = unknown>(
  path: string,
  method: string = 'POST',
  invalidateKeys?: string[][],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TInput) => api<TOutput>(path, { method, body }),
    onSuccess: () => {
      invalidateKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}
```

**Step 4: Commit**

```bash
git add apps/mobile/src/
git commit -m "feat(mobile): add AuthContext + useAuth + useApi hooks"
```

---

## Task 5: UI Components

**Files:**
- Create: `apps/mobile/src/components/ui/Button.tsx`
- Create: `apps/mobile/src/components/ui/Input.tsx`
- Create: `apps/mobile/src/components/ui/Card.tsx`
- Create: `apps/mobile/src/components/ui/Badge.tsx`
- Create: `apps/mobile/src/components/ui/Avatar.tsx`
- Create: `apps/mobile/src/components/ui/StarRating.tsx`
- Create: `apps/mobile/src/components/ui/Skeleton.tsx`
- Create: `apps/mobile/src/components/LoadingScreen.tsx`

**Step 1: Button.tsx**

```tsx
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

const variants: Record<Variant, { container: string; text: string }> = {
  default: {
    container: 'bg-primary-600 rounded-lg px-6 py-3',
    text: 'text-white font-semibold text-center',
  },
  outline: {
    container: 'border border-border rounded-lg px-6 py-3',
    text: 'text-foreground font-semibold text-center',
  },
  ghost: {
    container: 'px-6 py-3',
    text: 'text-primary-600 font-semibold text-center',
  },
  destructive: {
    container: 'bg-red-600 rounded-lg px-6 py-3',
    text: 'text-white font-semibold text-center',
  },
};

export function Button({ onPress, children, variant = 'default', disabled, loading, className = '' }: ButtonProps) {
  const v = variants[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${v.container} ${disabled ? 'opacity-50' : ''} ${className}`}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'default' ? '#fff' : '#dc2626'} />
      ) : (
        <Text className={v.text}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}
```

**Step 2: Input.tsx**

```tsx
import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label && <Text className="text-sm font-medium text-foreground mb-1">{label}</Text>}
      <TextInput
        className={`border rounded-lg px-4 py-3 text-base text-foreground ${
          error ? 'border-red-500' : 'border-border'
        } ${className}`}
        placeholderTextColor="#737373"
        {...props}
      />
      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
```

**Step 3: Card.tsx**

```tsx
import { View, type ViewProps } from 'react-native';

export function Card({ children, className = '', ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`bg-white rounded-xl border border-border p-4 ${className}`} {...props}>
      {children}
    </View>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`mb-3 ${className}`}>{children}</View>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={className}>{children}</View>;
}
```

**Step 4: Badge.tsx**

```tsx
import { View, Text } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline';

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'bg-primary-100', text: 'text-primary-700' },
  success: { bg: 'bg-green-100', text: 'text-green-700' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  destructive: { bg: 'bg-red-100', text: 'text-red-700' },
  outline: { bg: 'bg-transparent border border-border', text: 'text-foreground' },
};

export function Badge({ children, variant = 'default' }: { children: string; variant?: BadgeVariant }) {
  const v = variantStyles[variant];
  return (
    <View className={`rounded-full px-3 py-1 self-start ${v.bg}`}>
      <Text className={`text-xs font-medium ${v.text}`}>{children}</Text>
    </View>
  );
}
```

**Step 5: Avatar.tsx**

```tsx
import { View, Text, Image } from 'react-native';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

export function Avatar({ uri, name = '?', size = 48 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="bg-muted"
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-primary-100 items-center justify-center"
    >
      <Text className="text-primary-700 font-bold" style={{ fontSize: size * 0.35 }}>
        {initials}
      </Text>
    </View>
  );
}
```

**Step 6: StarRating.tsx**

```tsx
import { View, TouchableOpacity, Text } from 'react-native';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  onRate?: (rating: number) => void;
}

export function StarRating({ rating, maxStars = 5, size = 20, onRate }: StarRatingProps) {
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: maxStars }, (_, i) => {
        const filled = i < Math.round(rating);
        const star = (
          <Text key={i} style={{ fontSize: size, color: filled ? '#f59e0b' : '#d1d5db' }}>
            {filled ? '★' : '☆'}
          </Text>
        );
        return onRate ? (
          <TouchableOpacity key={i} onPress={() => onRate(i + 1)}>
            {star}
          </TouchableOpacity>
        ) : (
          star
        );
      })}
    </View>
  );
}
```

**Step 7: Skeleton.tsx**

```tsx
import { View } from 'react-native';
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export function Skeleton({ className = '' }: { className?: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View className={`bg-muted rounded-md ${className}`} style={{ opacity }} />;
}
```

**Step 8: LoadingScreen.tsx**

```tsx
import { View, ActivityIndicator } from 'react-native';

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color="#dc2626" />
    </View>
  );
}
```

**Step 9: Commit**

```bash
git add apps/mobile/src/components/
git commit -m "feat(mobile): add UI components (Button, Input, Card, Badge, Avatar, StarRating, Skeleton)"
```

---

## Task 6: Navigation Structure

**Files:**
- Create: `apps/mobile/src/navigation/AuthStack.tsx`
- Create: `apps/mobile/src/navigation/MainTabs.tsx`
- Create: `apps/mobile/src/navigation/AdminStack.tsx`
- Create: `apps/mobile/src/navigation/linking.ts`
- Modify: `apps/mobile/src/App.tsx`

**Step 1: Install navigation deps**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs react-native-screens
```

**Step 2: Create AuthStack.tsx**

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { RegisterScreen } from '@/screens/auth/RegisterScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
```

**Step 3: Create MainTabs.tsx**

```tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@marketplace/shared';

// Screen imports (will be created in later tasks — use placeholders first)
import { HomeScreen } from '@/screens/home/HomeScreen';
import { SearchResultsScreen } from '@/screens/home/SearchResultsScreen';
import { ProfileDetailScreen } from '@/screens/home/ProfileDetailScreen';
import { SemanticSearchScreen } from '@/screens/search/SemanticSearchScreen';
import { DashboardScreen } from '@/screens/dashboard/DashboardScreen';
import { EditProfileScreen } from '@/screens/dashboard/EditProfileScreen';
import { MyReviewsScreen } from '@/screens/dashboard/MyReviewsScreen';
import { SubscriptionScreen } from '@/screens/dashboard/SubscriptionScreen';
import { SettingsScreen } from '@/screens/dashboard/SettingsScreen';

// Param lists
export type HomeStackParamList = {
  Home: undefined;
  SearchResults: { q?: string; city?: string; service?: string };
  ProfileDetail: { id: string };
};

export type SearchStackParamList = {
  SemanticSearch: undefined;
  SearchResults: { q?: string };
  ProfileDetail: { id: string };
};

export type DashboardStackParamList = {
  Dashboard: undefined;
  EditProfile: { id: string };
  MyReviews: { profileId: string };
  Subscription: undefined;
  Settings: undefined;
};

export type ProfileStackParamList = {
  Settings: undefined;
};

// Stacks
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="SearchResults" component={SearchResultsScreen} />
      <HomeStack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
    </HomeStack.Navigator>
  );
}

const SearchStack = createNativeStackNavigator<SearchStackParamList>();
function SearchStackScreen() {
  return (
    <SearchStack.Navigator screenOptions={{ headerShown: false }}>
      <SearchStack.Screen name="SemanticSearch" component={SemanticSearchScreen} />
      <SearchStack.Screen name="SearchResults" component={SearchResultsScreen} />
      <SearchStack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
    </SearchStack.Navigator>
  );
}

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
function DashboardStackScreen() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStack.Screen name="Dashboard" component={DashboardScreen} />
      <DashboardStack.Screen name="EditProfile" component={EditProfileScreen} />
      <DashboardStack.Screen name="MyReviews" component={MyReviewsScreen} />
      <DashboardStack.Screen name="Subscription" component={SubscriptionScreen} />
      <DashboardStack.Screen name="Settings" component={SettingsScreen} />
    </DashboardStack.Navigator>
  );
}

const ProfileTabStack = createNativeStackNavigator<ProfileStackParamList>();
function ProfileStackScreen() {
  return (
    <ProfileTabStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileTabStack.Screen name="Settings" component={SettingsScreen} />
    </ProfileTabStack.Navigator>
  );
}

// Tab icons (simple text for now, replace with expo vector icons later)
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 10, color: focused ? '#dc2626' : '#737373' }}>{label}</Text>;
}

const Tab = createBottomTabNavigator();

export function MainTabs() {
  const { user } = useAuth();
  const isProfessional = user?.role === UserRole.Professional;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#dc2626',
        tabBarInactiveTintColor: '#737373',
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackScreen}
        options={{ tabBarLabel: 'Inicio', tabBarIcon: ({ focused }) => <TabIcon label="🏠" focused={focused} /> }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStackScreen}
        options={{ tabBarLabel: 'Busca', tabBarIcon: ({ focused }) => <TabIcon label="🔍" focused={focused} /> }}
      />
      {isProfessional && (
        <Tab.Screen
          name="DashboardTab"
          component={DashboardStackScreen}
          options={{ tabBarLabel: 'Painel', tabBarIcon: ({ focused }) => <TabIcon label="📊" focused={focused} /> }}
        />
      )}
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackScreen}
        options={{ tabBarLabel: 'Perfil', tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
```

**Step 4: Create AdminStack.tsx**

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminStatsScreen } from '@/screens/admin/AdminStatsScreen';
import { AdminModerationScreen } from '@/screens/admin/AdminModerationScreen';

export type AdminStackParamList = {
  AdminStats: undefined;
  AdminModeration: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminStats" component={AdminStatsScreen} />
      <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
    </Stack.Navigator>
  );
}
```

**Step 5: Create linking.ts**

```ts
import { type LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['marketplace://', 'https://marketplace.com'],
  config: {
    screens: {
      Auth: {
        screens: {
          ResetPassword: 'reset-password',
        },
      },
      Main: {
        screens: {
          HomeTab: {
            screens: {
              ProfileDetail: 'profile/:id',
            },
          },
        },
      },
    },
  },
};
```

**Step 6: Update App.tsx**

```tsx
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthStack } from '@/navigation/AuthStack';
import { MainTabs } from '@/navigation/MainTabs';
import { AdminStack } from '@/navigation/AdminStack';
import { LoadingScreen } from '@/components/LoadingScreen';
import { linking } from '@/navigation/linking';
import { UserRole } from '@marketplace/shared';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

function RootNavigator() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <AuthStack />;
  if (user?.role === UserRole.Admin || user?.role === UserRole.Moderator) return <AdminStack />;
  return <MainTabs />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```

**Step 7: Commit**

```bash
git add apps/mobile/src/
git commit -m "feat(mobile): add navigation structure (AuthStack, MainTabs, AdminStack, deep links)"
```

---

## Task 7: Auth Screens (4 screens)

**Files:**
- Create: `apps/mobile/src/screens/auth/LoginScreen.tsx`
- Create: `apps/mobile/src/screens/auth/RegisterScreen.tsx`
- Create: `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx`
- Create: `apps/mobile/src/screens/auth/ResetPasswordScreen.tsx`

**Step 1: Install form deps**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
pnpm add react-hook-form zod @hookform/resolvers
```

**Step 2: LoginScreen.tsx**

```tsx
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
});

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await login(data.email, data.password);
    } catch (e: any) {
      setError(e.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Entrar</Text>
        <Text className="text-muted-foreground mb-8">Acesse sua conta</Text>

        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Email"
              placeholder="seu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={value}
              onChangeText={onChange}
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Senha"
              placeholder="••••••••"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              error={errors.password?.message}
            />
          )}
        />

        <Button onPress={handleSubmit(onSubmit)} loading={loading}>
          Entrar
        </Button>

        <View className="flex-row justify-between mt-4">
          <Button variant="ghost" onPress={() => navigation.navigate('ForgotPassword')}>
            Esqueci a senha
          </Button>
          <Button variant="ghost" onPress={() => navigation.navigate('Register')}>
            Criar conta
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

**Step 3: RegisterScreen.tsx**

```tsx
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import { UserRole } from '@marketplace/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
});

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>(UserRole.User);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await register({ ...data, role });
    } catch (e: any) {
      setError(e.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Criar Conta</Text>
        <Text className="text-muted-foreground mb-8">Preencha seus dados</Text>

        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <Input label="Nome" placeholder="Seu nome" value={value} onChangeText={onChange} error={errors.name?.message} />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Input label="Email" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" value={value} onChangeText={onChange} error={errors.email?.message} />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <Input label="Senha" placeholder="••••••••" secureTextEntry value={value} onChangeText={onChange} error={errors.password?.message} />
          )}
        />

        <View className="flex-row gap-3 mb-6">
          <Button variant={role === UserRole.User ? 'default' : 'outline'} onPress={() => setRole(UserRole.User)}>
            Cliente
          </Button>
          <Button variant={role === UserRole.Professional ? 'default' : 'outline'} onPress={() => setRole(UserRole.Professional)}>
            Profissional
          </Button>
        </View>

        <Button onPress={handleSubmit(onSubmit)} loading={loading}>
          Criar Conta
        </Button>

        <Button variant="ghost" onPress={() => navigation.goBack()} className="mt-4">
          Ja tenho conta
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

**Step 4: ForgotPasswordScreen.tsx**

```tsx
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({ email: z.string().email('Email invalido') });
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: data, noAuth: true });
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View className="flex-1 justify-center items-center px-6 bg-background">
        <Text className="text-2xl font-bold text-foreground mb-4">Email Enviado!</Text>
        <Text className="text-muted-foreground text-center mb-6">Verifique sua caixa de entrada para redefinir a senha.</Text>
        <Button onPress={() => navigation.navigate('Login')}>Voltar ao Login</Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Recuperar Senha</Text>
        <Text className="text-muted-foreground mb-8">Informe seu email</Text>
        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Input label="Email" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" value={value} onChangeText={onChange} error={errors.email?.message} />
          )}
        />
        <Button onPress={handleSubmit(onSubmit)} loading={loading}>Enviar</Button>
        <Button variant="ghost" onPress={() => navigation.goBack()} className="mt-4">Voltar</Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

**Step 5: ResetPasswordScreen.tsx**

```tsx
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({ newPassword: z.string().min(8, 'Minimo 8 caracteres') });
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ route, navigation }: Props) {
  const { token } = route.params;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: data.newPassword }, noAuth: true });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View className="flex-1 justify-center items-center px-6 bg-background">
        <Text className="text-2xl font-bold text-foreground mb-4">Senha Redefinida!</Text>
        <Button onPress={() => navigation.navigate('Login')}>Ir para Login</Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Nova Senha</Text>
        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}
        <Controller
          control={control}
          name="newPassword"
          render={({ field: { onChange, value } }) => (
            <Input label="Nova Senha" placeholder="••••••••" secureTextEntry value={value} onChangeText={onChange} error={errors.newPassword?.message} />
          )}
        />
        <Button onPress={handleSubmit(onSubmit)} loading={loading}>Redefinir Senha</Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

**Step 6: Commit**

```bash
git add apps/mobile/src/screens/auth/
git commit -m "feat(mobile): add auth screens (Login, Register, ForgotPassword, ResetPassword)"
```

---

## Task 8: Home Screen + ProfileCard + SearchBar

**Files:**
- Create: `apps/mobile/src/components/ProfileCard.tsx`
- Create: `apps/mobile/src/components/SearchBar.tsx`
- Create: `apps/mobile/src/screens/home/HomeScreen.tsx`

**Step 1: ProfileCard.tsx**

```tsx
import { TouchableOpacity, View, Text } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/StarRating';
import { Badge } from '@/components/ui/Badge';

interface Profile {
  id: string;
  displayName: string;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  photos?: string[] | null;
  averageRating?: number;
  services?: string[] | null;
}

interface Props {
  profile: Profile;
  onPress: () => void;
}

export function ProfileCard({ profile, onPress }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="mb-3">
        <View className="flex-row items-center gap-3">
          <Avatar uri={profile.photos?.[0]} name={profile.displayName} size={56} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">{profile.displayName}</Text>
            {profile.city && (
              <Text className="text-sm text-muted-foreground">{profile.city}{profile.state ? `, ${profile.state}` : ''}</Text>
            )}
            {profile.averageRating != null && (
              <View className="flex-row items-center gap-1 mt-1">
                <StarRating rating={profile.averageRating} size={14} />
                <Text className="text-xs text-muted-foreground">{profile.averageRating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
        {profile.bio && (
          <Text className="text-sm text-muted-foreground mt-2" numberOfLines={2}>{profile.bio}</Text>
        )}
        {profile.services && profile.services.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-2">
            {profile.services.slice(0, 3).map((s) => (
              <Badge key={s} variant="outline">{s}</Badge>
            ))}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}
```

**Step 2: SearchBar.tsx**

```tsx
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { useState, useCallback, useRef } from 'react';

interface Props {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = 'Buscar profissionais...' }: Props) {
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(text), 400);
  }, [onSearch]);

  return (
    <View className="flex-row items-center bg-muted rounded-xl px-4 py-3">
      <Text className="mr-2 text-muted-foreground">🔍</Text>
      <TextInput
        className="flex-1 text-base text-foreground"
        placeholder={placeholder}
        placeholderTextColor="#737373"
        value={query}
        onChangeText={handleChange}
        returnKeyType="search"
        onSubmitEditing={() => onSearch(query)}
      />
    </View>
  );
}
```

**Step 3: HomeScreen.tsx**

```tsx
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { SearchBar } from '@/components/SearchBar';
import { ProfileCard } from '@/components/ProfileCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';
import type { PaginatedResult } from '@marketplace/shared';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

interface Profile {
  id: string;
  displayName: string;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  photos?: string[] | null;
  averageRating?: number;
  services?: string[] | null;
}

export function HomeScreen({ navigation }: Props) {
  const { data, isLoading, refetch, isRefetching } = useApiQuery<PaginatedResult<Profile>>(
    ['profiles', 'featured'],
    '/profiles?limit=10',
  );

  const handleSearch = (q: string) => {
    if (q.trim()) navigation.navigate('SearchResults', { q });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground mb-4">Marketplace FTM</Text>
        <SearchBar onSearch={handleSearch} />
      </View>

      {isLoading ? (
        <View className="px-4 gap-3 mt-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </View>
      ) : (
        <FlatList
          data={data?.data || []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pt-4 pb-8"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <ProfileCard
              profile={item}
              onPress={() => navigation.navigate('ProfileDetail', { id: item.id })}
            />
          )}
          ListEmptyComponent={
            <Text className="text-center text-muted-foreground mt-8">Nenhum profissional encontrado</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
```

**Step 4: Commit**

```bash
git add apps/mobile/src/
git commit -m "feat(mobile): add Home screen with ProfileCard + SearchBar"
```

---

## Task 9: SearchResults Screen

**Files:**
- Create: `apps/mobile/src/screens/home/SearchResultsScreen.tsx`

**Step 1: SearchResultsScreen.tsx**

```tsx
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { SearchBar } from '@/components/SearchBar';
import { ProfileCard } from '@/components/ProfileCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';
import type { PaginatedResult } from '@marketplace/shared';

type Props = NativeStackScreenProps<HomeStackParamList, 'SearchResults'>;

interface Profile {
  id: string;
  displayName: string;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  photos?: string[] | null;
  averageRating?: number;
  services?: string[] | null;
}

export function SearchResultsScreen({ route, navigation }: Props) {
  const { q: initialQ, city, service } = route.params;
  const [query, setQuery] = useState(initialQ || '');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (city) params.set('city', city);
  if (service) params.set('services', service);
  params.set('page', String(page));
  params.set('limit', '20');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['search', query, city, service, page],
    queryFn: () => api<PaginatedResult<Profile>>(`/search?${params}`),
    enabled: !!query,
    staleTime: 30_000,
  });

  const handleSearch = (q: string) => {
    setQuery(q);
    setPage(1);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2 flex-row items-center gap-2">
        <Button variant="ghost" onPress={() => navigation.goBack()}>←</Button>
        <View className="flex-1">
          <SearchBar onSearch={handleSearch} placeholder={query || 'Buscar...'} />
        </View>
      </View>

      {isLoading ? (
        <View className="px-4 gap-3 mt-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </View>
      ) : (
        <FlatList
          data={data?.data || []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pt-2 pb-8"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <ProfileCard
              profile={item}
              onPress={() => navigation.navigate('ProfileDetail', { id: item.id })}
            />
          )}
          ListEmptyComponent={
            <Text className="text-center text-muted-foreground mt-8">
              {query ? 'Nenhum resultado encontrado' : 'Digite algo para buscar'}
            </Text>
          }
          ListFooterComponent={
            data && data.totalPages > page ? (
              <Button variant="outline" onPress={() => setPage((p) => p + 1)}>Carregar mais</Button>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
```

**Step 2: Commit**

```bash
git add apps/mobile/src/screens/home/SearchResultsScreen.tsx
git commit -m "feat(mobile): add SearchResults screen with pagination"
```

---

## Task 10: ProfileDetail Screen + ReviewItem

**Files:**
- Create: `apps/mobile/src/components/ReviewItem.tsx`
- Create: `apps/mobile/src/screens/home/ProfileDetailScreen.tsx`

**Step 1: ReviewItem.tsx**

```tsx
import { View, Text } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/StarRating';

interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: { name?: string } | null;
}

export function ReviewItem({ review }: { review: Review }) {
  const date = new Date(review.createdAt).toLocaleDateString('pt-BR');
  return (
    <View className="py-3 border-b border-border">
      <View className="flex-row items-center gap-2 mb-1">
        <Avatar name={review.user?.name || 'A'} size={32} />
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground">{review.user?.name || 'Anonimo'}</Text>
          <Text className="text-xs text-muted-foreground">{date}</Text>
        </View>
        <StarRating rating={review.rating} size={14} />
      </View>
      {review.comment && <Text className="text-sm text-foreground mt-1">{review.comment}</Text>}
    </View>
  );
}
```

**Step 2: ProfileDetailScreen.tsx**

```tsx
import { View, Text, ScrollView, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Avatar } from '@/components/ui/Avatar';
import { StarRating } from '@/components/ui/StarRating';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ReviewItem } from '@/components/ReviewItem';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<HomeStackParamList, 'ProfileDetail'>;

const { width } = Dimensions.get('window');

export function ProfileDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: profile, isLoading } = useApiQuery<any>(['profile', id], `/profiles/${id}`, { staleTime: 300_000 });
  const { data: reviews } = useApiQuery<any>(['reviews', id], `/reviews/profile/${id}?limit=10`);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background px-4 pt-4">
        <Skeleton className="h-64 w-full mb-4" />
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-20 w-full" />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-muted-foreground">Perfil nao encontrado</Text>
        <Button variant="ghost" onPress={() => navigation.goBack()}>Voltar</Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView>
        {/* Photos carousel (simple horizontal scroll) */}
        {profile.photos?.length > 0 && (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {profile.photos.map((uri: string, i: number) => (
              <Image key={i} source={{ uri }} style={{ width, height: 300 }} resizeMode="cover" />
            ))}
          </ScrollView>
        )}

        <View className="px-4 pt-4">
          {/* Back button */}
          <Button variant="ghost" onPress={() => navigation.goBack()} className="self-start mb-2">
            ← Voltar
          </Button>

          {/* Header */}
          <View className="flex-row items-center gap-3 mb-4">
            <Avatar uri={profile.photos?.[0]} name={profile.displayName} size={64} />
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{profile.displayName}</Text>
              {profile.city && (
                <Text className="text-sm text-muted-foreground">{profile.city}{profile.state ? `, ${profile.state}` : ''}</Text>
              )}
              {profile.averageRating != null && (
                <View className="flex-row items-center gap-1 mt-1">
                  <StarRating rating={profile.averageRating} size={16} />
                  <Text className="text-sm text-muted-foreground">{profile.averageRating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Services */}
          {profile.services?.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {profile.services.map((s: string) => <Badge key={s}>{s}</Badge>)}
            </View>
          )}

          {/* Bio */}
          {profile.bio && <Text className="text-base text-foreground mb-4">{profile.bio}</Text>}

          {/* Description */}
          {profile.description && (
            <Text className="text-sm text-muted-foreground mb-6">{profile.description}</Text>
          )}

          {/* Reviews */}
          <Text className="text-lg font-bold text-foreground mb-2">Avaliacoes</Text>
          {reviews?.data?.map((r: any) => <ReviewItem key={r.id} review={r} />) || (
            <Text className="text-muted-foreground">Sem avaliacoes ainda</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/src/
git commit -m "feat(mobile): add ProfileDetail screen + ReviewItem component"
```

---

## Task 11: Semantic Search Screen

**Files:**
- Create: `apps/mobile/src/screens/search/SemanticSearchScreen.tsx`

**Step 1: SemanticSearchScreen.tsx**

```tsx
import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { SearchBar } from '@/components/SearchBar';
import { ProfileCard } from '@/components/ProfileCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SearchStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<SearchStackParamList, 'SemanticSearch'>;

export function SemanticSearchScreen({ navigation }: Props) {
  const [results, setResults] = useState<any[]>([]);

  const mutation = useMutation({
    mutationFn: (query: string) =>
      api<{ results: any[]; meta: any }>('/search/semantic', {
        method: 'POST',
        body: { query, limit: 20 },
      }),
    onSuccess: (data) => setResults(data.results),
  });

  const handleSearch = useCallback((q: string) => {
    if (q.trim().length >= 3) mutation.mutate(q);
  }, [mutation]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground mb-4">Busca Inteligente</Text>
        <SearchBar onSearch={handleSearch} placeholder="Descreva o que voce procura..." />
      </View>

      {mutation.isPending ? (
        <View className="px-4 gap-3 mt-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pt-2 pb-8"
          renderItem={({ item }) => (
            <ProfileCard
              profile={item}
              onPress={() => navigation.navigate('ProfileDetail', { id: item.id })}
            />
          )}
          ListEmptyComponent={
            mutation.isIdle ? (
              <Text className="text-center text-muted-foreground mt-8">
                Descreva em linguagem natural o profissional que voce busca
              </Text>
            ) : (
              <Text className="text-center text-muted-foreground mt-8">Nenhum resultado</Text>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
```

**Step 2: Commit**

```bash
git add apps/mobile/src/screens/search/
git commit -m "feat(mobile): add SemanticSearch screen with AI-powered search"
```

---

## Task 12: Dashboard + EditProfile Screens

**Files:**
- Create: `apps/mobile/src/screens/dashboard/DashboardScreen.tsx`
- Create: `apps/mobile/src/screens/dashboard/EditProfileScreen.tsx`

**Step 1: DashboardScreen.tsx**

```tsx
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReviewItem } from '@/components/ReviewItem';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';
import type { PaginatedResult } from '@marketplace/shared';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: profiles, isLoading, refetch, isRefetching } = useApiQuery<PaginatedResult<any>>(
    ['my-profiles'],
    `/profiles?limit=1`,
  );
  const profile = profiles?.data?.[0];
  const { data: reviews } = useApiQuery<PaginatedResult<any>>(
    ['my-reviews', profile?.id],
    `/reviews/profile/${profile?.id}?limit=5`,
    { enabled: !!profile?.id },
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <Text className="text-2xl font-bold text-foreground mb-4">Painel</Text>

        {/* Stats */}
        <View className="flex-row gap-3 mb-4">
          <Card className="flex-1">
            <Text className="text-sm text-muted-foreground">Visualizacoes</Text>
            <Text className="text-2xl font-bold text-foreground">{profile?.viewCount || 0}</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-sm text-muted-foreground">Avaliacoes</Text>
            <Text className="text-2xl font-bold text-foreground">{profile?.reviewCount || 0}</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-sm text-muted-foreground">Rating</Text>
            <Text className="text-2xl font-bold text-foreground">{profile?.averageRating?.toFixed(1) || '—'}</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <View className="gap-2 mb-6">
          {profile && (
            <Button onPress={() => navigation.navigate('EditProfile', { id: profile.id })}>Editar Perfil</Button>
          )}
          {profile && (
            <Button variant="outline" onPress={() => navigation.navigate('MyReviews', { profileId: profile.id })}>
              Ver Avaliacoes
            </Button>
          )}
          <Button variant="outline" onPress={() => navigation.navigate('Subscription')}>Assinatura</Button>
          <Button variant="outline" onPress={() => navigation.navigate('Settings')}>Configuracoes</Button>
        </View>

        {/* Recent Reviews */}
        <Text className="text-lg font-bold text-foreground mb-2">Avaliacoes Recentes</Text>
        {reviews?.data?.map((r: any) => <ReviewItem key={r.id} review={r} />) || (
          <Text className="text-muted-foreground">Sem avaliacoes</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

**Step 2: EditProfileScreen.tsx**

```tsx
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'EditProfile'>;

const schema = z.object({
  displayName: z.string().min(2).max(100),
  bio: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
});

type FormData = z.infer<typeof schema>;

export function EditProfileScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: profile } = useApiQuery<any>(['profile', id], `/profiles/${id}`);
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (profile) {
      reset({
        displayName: profile.displayName,
        bio: profile.bio || '',
        description: profile.description || '',
        city: profile.city || '',
        state: profile.state || '',
      });
    }
  }, [profile, reset]);

  const mutation = useApiMutation<FormData>(`/profiles/${id}`, 'PATCH', [['profile', id], ['my-profiles']]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await mutation.mutateAsync(data);
      Alert.alert('Sucesso', 'Perfil atualizado!');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerClassName="px-4 pt-4 pb-8">
          <View className="flex-row items-center mb-4">
            <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
            <Text className="text-xl font-bold text-foreground ml-2">Editar Perfil</Text>
          </View>

          <Controller control={control} name="displayName" render={({ field: { onChange, value } }) => (
            <Input label="Nome de exibicao" value={value} onChangeText={onChange} error={errors.displayName?.message} />
          )} />

          <Controller control={control} name="bio" render={({ field: { onChange, value } }) => (
            <Input label="Bio" value={value} onChangeText={onChange} multiline numberOfLines={3} error={errors.bio?.message} />
          )} />

          <Controller control={control} name="description" render={({ field: { onChange, value } }) => (
            <Input label="Descricao" value={value} onChangeText={onChange} multiline numberOfLines={5} error={errors.description?.message} />
          )} />

          <Controller control={control} name="city" render={({ field: { onChange, value } }) => (
            <Input label="Cidade" value={value} onChangeText={onChange} error={errors.city?.message} />
          )} />

          <Controller control={control} name="state" render={({ field: { onChange, value } }) => (
            <Input label="Estado" value={value} onChangeText={onChange} error={errors.state?.message} />
          )} />

          <Button onPress={handleSubmit(onSubmit)} loading={loading} className="mt-4">Salvar</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/src/screens/dashboard/
git commit -m "feat(mobile): add Dashboard + EditProfile screens"
```

---

## Task 13: MyReviews + Subscription Screens

**Files:**
- Create: `apps/mobile/src/screens/dashboard/MyReviewsScreen.tsx`
- Create: `apps/mobile/src/screens/dashboard/SubscriptionScreen.tsx`

**Step 1: MyReviewsScreen.tsx**

```tsx
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useApiPaginated } from '@/hooks/useApi';
import { ReviewItem } from '@/components/ReviewItem';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'MyReviews'>;

export function MyReviewsScreen({ route, navigation }: Props) {
  const { profileId } = route.params;
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch, isRefetching } = useApiPaginated<any>(
    ['my-reviews', profileId],
    `/reviews/profile/${profileId}`,
    page,
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-4 mb-2">
        <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
        <Text className="text-xl font-bold text-foreground ml-2">Minhas Avaliacoes</Text>
      </View>

      {isLoading ? (
        <View className="px-4 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </View>
      ) : (
        <FlatList
          data={data?.data || []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => <ReviewItem review={item} />}
          ListEmptyComponent={<Text className="text-center text-muted-foreground mt-8">Sem avaliacoes</Text>}
          ListFooterComponent={
            data && data.totalPages > page ? (
              <Button variant="outline" onPress={() => setPage((p) => p + 1)} className="mt-4">Carregar mais</Button>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
```

**Step 2: SubscriptionScreen.tsx**

```tsx
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Subscription'>;

const plans = [
  { id: 'free', name: 'Gratis', price: 'R$ 0', features: ['Perfil basico', 'Busca limitada'] },
  { id: 'basic', name: 'Basico', price: 'R$ 29/mes', features: ['Perfil completo', 'Estatisticas', 'Destaque na busca'] },
  { id: 'professional', name: 'Profissional', price: 'R$ 79/mes', features: ['Tudo do Basico', 'Busca semantica', 'Prioridade no ranking', 'Analytics'] },
  { id: 'premium', name: 'Premium', price: 'R$ 149/mes', features: ['Tudo do Profissional', 'Selo verificado', 'Suporte prioritario', 'API access'] },
];

export function SubscriptionScreen({ navigation }: Props) {
  const { data: current, refetch } = useApiQuery<any>(['subscription'], '/subscriptions/current');
  const upgrade = useApiMutation<{ planId: string }>('/subscriptions/upgrade', 'POST', [['subscription']]);
  const cancel = useApiMutation<void>('/subscriptions/cancel', 'POST', [['subscription']]);

  const handleUpgrade = async (planId: string) => {
    try {
      await upgrade.mutateAsync({ planId });
      Alert.alert('Sucesso', 'Plano atualizado!');
      refetch();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao atualizar plano');
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancelar Assinatura', 'Tem certeza?', [
      { text: 'Nao' },
      { text: 'Sim', style: 'destructive', onPress: async () => {
        try {
          await cancel.mutateAsync(undefined as any);
          Alert.alert('Assinatura cancelada');
          refetch();
        } catch (e: any) {
          Alert.alert('Erro', e.message);
        }
      }},
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
          <Text className="text-xl font-bold text-foreground ml-2">Assinatura</Text>
        </View>

        {current && (
          <Card className="mb-4 bg-primary-50">
            <Text className="text-sm text-muted-foreground">Plano atual</Text>
            <Text className="text-lg font-bold text-foreground capitalize">{current.planType}</Text>
            {current.planType !== 'free' && (
              <Button variant="destructive" onPress={handleCancel} className="mt-2">Cancelar</Button>
            )}
          </Card>
        )}

        {plans.map((plan) => (
          <Card key={plan.id} className="mb-3">
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-foreground">{plan.name}</Text>
                <Text className="text-lg font-semibold text-primary-600">{plan.price}</Text>
              </View>
            </CardHeader>
            <CardContent>
              {plan.features.map((f) => (
                <Text key={f} className="text-sm text-muted-foreground mb-1">• {f}</Text>
              ))}
              {current?.planType !== plan.id && (
                <Button variant="outline" onPress={() => handleUpgrade(plan.id)} className="mt-3">
                  {plan.id === 'free' ? 'Downgrade' : 'Assinar'}
                </Button>
              )}
              {current?.planType === plan.id && (
                <Badge variant="success" className="mt-3">Plano atual</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/src/screens/dashboard/
git commit -m "feat(mobile): add MyReviews + Subscription screens"
```

---

## Task 14: Settings Screen

**Files:**
- Create: `apps/mobile/src/screens/dashboard/SettingsScreen.tsx`

**Step 1: SettingsScreen.tsx**

```tsx
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Settings'>;

const profileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export function SettingsScreen({ navigation }: Props) {
  const { user, logout, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '' },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const saveProfile = async (data: any) => {
    setLoading(true);
    try {
      await api('/auth/me', { method: 'PATCH', body: data });
      await refreshUser();
      Alert.alert('Sucesso', 'Dados atualizados');
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (data: any) => {
    setLoading(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: data });
      Alert.alert('Sucesso', 'Senha alterada');
      passwordForm.reset();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = () => {
    Alert.alert('Deletar Conta', 'Esta acao e irreversivel. Tem certeza?', [
      { text: 'Cancelar' },
      { text: 'Deletar', style: 'destructive', onPress: async () => {
        try {
          await api('/auth/me', { method: 'DELETE' });
          await logout();
        } catch (e: any) {
          Alert.alert('Erro', e.message);
        }
      }},
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pt-4 pb-8">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
          <Text className="text-xl font-bold text-foreground ml-2">Configuracoes</Text>
        </View>

        {/* Profile data */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold mb-3">Dados Pessoais</Text>
          <Controller control={profileForm.control} name="name" render={({ field: { onChange, value } }) => (
            <Input label="Nome" value={value} onChangeText={onChange} />
          )} />
          <Controller control={profileForm.control} name="email" render={({ field: { onChange, value } }) => (
            <Input label="Email" value={value} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" />
          )} />
          <Button onPress={profileForm.handleSubmit(saveProfile)} loading={loading}>Salvar</Button>
        </Card>

        {/* Change password */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold mb-3">Trocar Senha</Text>
          <Controller control={passwordForm.control} name="currentPassword" render={({ field: { onChange, value } }) => (
            <Input label="Senha atual" secureTextEntry value={value} onChangeText={onChange} />
          )} />
          <Controller control={passwordForm.control} name="newPassword" render={({ field: { onChange, value } }) => (
            <Input label="Nova senha" secureTextEntry value={value} onChangeText={onChange} />
          )} />
          <Button variant="outline" onPress={passwordForm.handleSubmit(changePassword)} loading={loading}>Alterar Senha</Button>
        </Card>

        {/* Actions */}
        <Button variant="outline" onPress={() => logout()} className="mb-3">Sair da Conta</Button>
        <Button variant="destructive" onPress={deleteAccount}>Deletar Conta</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
```

**Step 2: Commit**

```bash
git add apps/mobile/src/screens/dashboard/SettingsScreen.tsx
git commit -m "feat(mobile): add Settings screen with profile, password, delete account"
```

---

## Task 15: Admin Screens

**Files:**
- Create: `apps/mobile/src/screens/admin/AdminStatsScreen.tsx`
- Create: `apps/mobile/src/screens/admin/AdminModerationScreen.tsx`

**Step 1: AdminStatsScreen.tsx**

```tsx
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '@/navigation/AdminStack';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminStats'>;

export function AdminStatsScreen({ navigation }: Props) {
  const { data, isLoading, refetch, isRefetching } = useApiQuery<any>(['admin-stats'], '/admin/stats');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <Text className="text-2xl font-bold text-foreground mb-4">Admin</Text>

        {isLoading ? (
          <View className="gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </View>
        ) : (
          <>
            <View className="flex-row gap-3 mb-3">
              <Card className="flex-1">
                <Text className="text-sm text-muted-foreground">Usuarios</Text>
                <Text className="text-2xl font-bold">{data?.totalUsers || 0}</Text>
              </Card>
              <Card className="flex-1">
                <Text className="text-sm text-muted-foreground">Perfis</Text>
                <Text className="text-2xl font-bold">{data?.totalProfiles || 0}</Text>
              </Card>
            </View>
            <View className="flex-row gap-3 mb-6">
              <Card className="flex-1">
                <Text className="text-sm text-muted-foreground">Avaliacoes</Text>
                <Text className="text-2xl font-bold">{data?.totalReviews || 0}</Text>
              </Card>
              <Card className="flex-1">
                <Text className="text-sm text-muted-foreground">Receita</Text>
                <Text className="text-2xl font-bold">R$ {data?.revenue || 0}</Text>
              </Card>
            </View>
          </>
        )}

        <Button onPress={() => navigation.navigate('AdminModeration')}>Fila de Moderacao</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
```

**Step 2: AdminModerationScreen.tsx**

```tsx
import { View, Text, FlatList, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { api } from '@/services/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '@/navigation/AdminStack';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminModeration'>;

export function AdminModerationScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useApiQuery<any[]>(
    ['moderation-queue'],
    '/moderation/queue',
  );

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      await api(`/moderation/queue/${id}/${action}`, { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center px-4 pt-4 mb-2">
        <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
        <Text className="text-xl font-bold text-foreground ml-2">Moderacao</Text>
      </View>

      <FlatList
        data={data || []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <Card className="mb-3">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-semibold text-foreground">{item.entityType}</Text>
              <Badge variant="warning">{item.status}</Badge>
            </View>
            <Text className="text-sm text-muted-foreground mb-3" numberOfLines={3}>{item.reason || 'Pendente de revisao'}</Text>
            <View className="flex-row gap-2">
              <Button onPress={() => handleAction(item.id, 'approve')} className="flex-1">Aprovar</Button>
              <Button variant="destructive" onPress={() => handleAction(item.id, 'reject')} className="flex-1">Rejeitar</Button>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <Text className="text-center text-muted-foreground mt-8">Fila de moderacao vazia</Text>
        }
      />
    </SafeAreaView>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/src/screens/admin/
git commit -m "feat(mobile): add Admin screens (Stats + Moderation)"
```

---

## Task 16: Push Notifications (Backend + Mobile)

**Files:**
- Create: `apps/api/src/modules/notifications/dto/register-device.dto.ts`
- Modify: `apps/api/src/modules/notifications/notifications.controller.ts`
- Create: `apps/mobile/src/hooks/usePushNotifications.ts`
- Modify: `apps/mobile/src/App.tsx` (register on login)

**Step 1: Backend — register-device.dto.ts**

```ts
import { IsString, IsIn } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  expoPushToken!: string;

  @IsString()
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}
```

**Step 2: Backend — Add endpoint to notifications controller**

Add to existing notifications controller:

```ts
@Post('register-device')
@UseGuards(JwtAuthGuard)
async registerDevice(@CurrentUser() user: JwtUser, @Body() dto: RegisterDeviceDto) {
  // Upsert device token — implementation depends on existing schema
  // If device_tokens table doesn't exist, create it
  return { success: true, data: { message: 'Device registered' } };
}
```

Note: This requires a `device_tokens` table. Create migration:

```sql
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, expo_push_token)
);
```

**Step 3: Mobile — usePushNotifications.ts**

```ts
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    registerForPushNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // handle foreground notification
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      // handle notification tap
    });

    return () => {
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);
}

async function registerForPushNotifications() {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const expoPushToken = tokenData.data;

  try {
    await api('/notifications/register-device', {
      method: 'POST',
      body: {
        expoPushToken,
        platform: Platform.OS as 'ios' | 'android',
      },
    });
  } catch {
    // Silently fail — will retry next app launch
  }
}
```

**Step 4: Install expo-notifications + expo-device**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx expo install expo-notifications expo-device
```

**Step 5: Commit**

```bash
git add apps/mobile/src/hooks/usePushNotifications.ts apps/api/src/modules/notifications/
git commit -m "feat(mobile): add push notification registration (backend + mobile)"
```

---

## Task 17: Deep Linking + Final Integration

**Files:**
- Modify: `apps/mobile/src/App.tsx` (add push notifications hook)
- Modify: `apps/mobile/src/navigation/linking.ts` (verify config)

**Step 1: Install expo-linking**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx expo install expo-linking
```

**Step 2: Update App.tsx with push notifications**

Import and call `usePushNotifications()` inside `RootNavigator` (after auth check):

```tsx
function RootNavigator() {
  const { user, isLoading, isAuthenticated } = useAuth();
  usePushNotifications(); // register on every app start

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <AuthStack />;
  if (user?.role === UserRole.Admin || user?.role === UserRole.Moderator) return <AdminStack />;
  return <MainTabs />;
}
```

**Step 3: Update app.json with deep link scheme**

```json
{
  "expo": {
    "name": "Marketplace FTM",
    "slug": "marketplace-ftm",
    "scheme": "marketplace",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": { "bundleIdentifier": "com.marketplace.ftm" },
    "android": {
      "package": "com.marketplace.ftm",
      "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#ffffff" }
    },
    "plugins": ["expo-secure-store", "expo-notifications"]
  }
}
```

**Step 4: Run full app**

```bash
cd "C:/Users/manod/Downloads/marketplace FTM/apps/mobile"
npx expo start --clear
```

**Step 5: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): add deep linking, push notifications integration, app config"
```

---

## Summary

| Task | Description | Screens |
|------|-------------|---------|
| 1 | Expo project scaffold | — |
| 2 | NativeWind + theme | — |
| 3 | API client + storage | — |
| 4 | Auth context + hooks | — |
| 5 | UI components (7) | — |
| 6 | Navigation structure | — |
| 7 | Auth screens | 4 |
| 8 | Home + ProfileCard | 1 |
| 9 | SearchResults | 1 |
| 10 | ProfileDetail + ReviewItem | 1 |
| 11 | SemanticSearch | 1 |
| 12 | Dashboard + EditProfile | 2 |
| 13 | MyReviews + Subscription | 2 |
| 14 | Settings | 1 |
| 15 | Admin screens | 2 |
| 16 | Push notifications | — |
| 17 | Deep linking + integration | — |

**Total: 17 tasks, 15 screens, ~20 files created**
