# Design — App Mobile Marketplace FTM

> **Data**: 2026-03-04
> **Stack**: Expo (managed) + React Navigation + NativeWind + TanStack Query
> **Publico**: Clientes + Profissionais (app unico, experiencia adaptada por role)

---

## Arquitetura

Expo managed workflow dentro do monorepo como `apps/mobile`. Compartilha `packages/shared` (types, DTOs, enums) com a API. Nao compartilha componentes UI com o web (NativeWind != shadcn).

```
apps/mobile/
├── app.json                  ← Expo config
├── babel.config.js
├── tailwind.config.js        ← NativeWind config
├── package.json
├── tsconfig.json
├── src/
│   ├── App.tsx               ← Entry point + NavigationContainer
│   ├── navigation/
│   │   ├── AuthStack.tsx     ← Login, Register, Forgot/Reset Password
│   │   ├── MainTabs.tsx      ← Bottom Tab Navigator (Home, Search, Dashboard, Profile)
│   │   ├── AdminStack.tsx    ← Admin screens (conditional by role)
│   │   └── linking.ts        ← Deep link config
│   ├── screens/
│   │   ├── auth/             ← LoginScreen, RegisterScreen, ForgotPasswordScreen, ResetPasswordScreen
│   │   ├── home/             ← HomeScreen, SearchResultsScreen, ProfileDetailScreen
│   │   ├── search/           ← SemanticSearchScreen
│   │   ├── dashboard/        ← DashboardScreen, EditProfileScreen, MyReviewsScreen, SubscriptionScreen, SettingsScreen
│   │   └── admin/            ← AdminStatsScreen, AdminModerationScreen
│   ├── components/
│   │   ├── ui/               ← Button, Input, Card, Badge, Avatar, StarRating
│   │   ├── ProfileCard.tsx   ← Card de perfil reutilizavel
│   │   ├── ReviewItem.tsx    ← Item de avaliacao
│   │   ├── SearchBar.tsx     ← Barra de busca com debounce
│   │   └── LoadingScreen.tsx ← Tela de loading padrao
│   ├── hooks/
│   │   ├── useAuth.ts        ← Login, logout, token management, role check
│   │   ├── useApi.ts         ← TanStack Query wrapper com auth headers
│   │   └── usePushNotifications.ts ← Expo push token registration
│   ├── services/
│   │   ├── api.ts            ← Fetch wrapper (base URL, tokens, refresh, 401 redirect)
│   │   └── storage.ts        ← expo-secure-store wrapper
│   └── lib/
│       ├── theme.ts          ← Cores, fontes (dark mode ready)
│       └── utils.ts          ← Formatters (moeda, data, etc)
```

## Navegacao (React Navigation)

```
NavigationContainer
├── AuthStack (nao autenticado)
│   ├── Login
│   ├── Register
│   ├── ForgotPassword
│   └── ResetPassword (deep link)
│
├── MainTabs (autenticado)
│   ├── HomeTab (Stack)
│   │   ├── Home (busca + destaques)
│   │   ├── SearchResults
│   │   └── ProfileDetail
│   ├── SearchTab (Stack)
│   │   ├── SemanticSearch
│   │   ├── SearchResults
│   │   └── ProfileDetail
│   ├── DashboardTab (Stack) — visivel para role=professional
│   │   ├── Dashboard (stats + acoes rapidas)
│   │   ├── EditProfile
│   │   ├── MyReviews
│   │   ├── Subscription
│   │   └── Settings
│   └── ProfileTab (Stack)
│       ├── MyProfile (visualizacao)
│       └── Settings (para role=user)
│
└── AdminStack (role=admin/moderator)
    ├── AdminStats
    └── AdminModeration
```

### Deep Links
- `marketplace://reset-password?token=xxx` → ResetPasswordScreen
- `marketplace://profile/:id` → ProfileDetailScreen

## Telas

### Auth (4 telas)
| Tela | Descricao | API |
|------|-----------|-----|
| Login | Email + senha, link forgot/register | POST /auth/login |
| Register | Nome, email, senha, selecao de role | POST /auth/register |
| ForgotPassword | Email input, estado de sucesso | POST /auth/forgot-password |
| ResetPassword | Token deep link, nova senha | POST /auth/reset-password |

### Home + Busca (3 telas)
| Tela | Descricao | API |
|------|-----------|-----|
| Home | HeroSearch + FlatList de perfis destaque | GET /profiles?limit=6 |
| SearchResults | Lista com filtros (cidade, servico, rating) | GET /search?q=... |
| ProfileDetail | Bio, servicos, fotos (carousel), reviews, CTA | GET /profiles/:id, GET /reviews/profile/:id |

### Search Dedicado (1 tela)
| Tela | Descricao | API |
|------|-----------|-----|
| SemanticSearch | Input com debounce, resultados inline | POST /search/semantic |

### Dashboard Profissional (5 telas)
| Tela | Descricao | API |
|------|-----------|-----|
| Dashboard | Stats cards, acoes rapidas, reviews recentes | GET /profiles, GET /reviews |
| EditProfile | Formulario + ImagePicker pra fotos | PATCH /profiles/:id, POST /uploads/presigned |
| MyReviews | FlatList de reviews com star rating + sentiment | GET /reviews/profile/:id |
| Subscription | Plano atual, comparacao 3 tiers, upgrade/cancel | GET /subscriptions/current, POST /subscriptions/upgrade |
| Settings | Dados pessoais, trocar senha, deletar conta | PATCH /auth/me, POST /auth/change-password, DELETE /auth/me |

### Admin (2 telas)
| Tela | Descricao | API |
|------|-----------|-----|
| AdminStats | Cards de metricas (users, profiles, GMV) | GET /admin/stats |
| AdminModeration | Fila de moderacao, approve/reject | GET /moderation/queue, POST /moderation/queue/:id/approve |

**Total: 15 telas**

## API Client

Reutiliza a mesma API REST (`/api/v1/*`). Nao precisa de mudancas no backend.

```typescript
// services/api.ts
const API_BASE = __DEV__
  ? 'http://10.0.2.2:3001/api/v1'  // Android emulator
  : 'https://api.marketplace.com/api/v1';

// Token management via expo-secure-store
// Auto-refresh via interceptor no useApi hook
// 401 → navega para LoginScreen
```

### Data Fetching (TanStack Query)
- Queries com staleTime de 30s para listas, 5min para detalhes
- Mutations com optimistic updates para acoes do usuario
- Prefetch de perfis ao scroll (infinite query)
- Cache invalidation apos mutations (reviews, profile update)

## Push Notifications

### Backend (novo endpoint)
```
POST /api/v1/notifications/register-device
Body: { expoPushToken: string, platform: 'ios' | 'android' }
```

Schema novo: `device_tokens` (userId, expoPushToken, platform, createdAt)

### Fluxo
1. App registra token Expo no login/startup
2. Backend salva token associado ao userId
3. Notification worker envia via Expo Push API (alem do WebSocket)
4. Tipos de push: novo review, pagamento, moderacao, assinatura

## Libs

| Lib | Uso |
|-----|-----|
| expo ~52 | Framework base |
| react-navigation v7 | Navegacao (Stack + Bottom Tabs) |
| nativewind v4 | Tailwind CSS no RN |
| @tanstack/react-query v5 | Data fetching + cache |
| expo-secure-store | Token storage seguro |
| expo-notifications | Push notifications |
| expo-image-picker | Upload de fotos |
| react-hook-form + zod | Formularios com validacao |
| expo-linking | Deep links |

## UI Components (NativeWind)

Recriar componentes equivalentes ao shadcn do web, estilizados com NativeWind:
- Button (variants: default, outline, ghost, destructive)
- Input (com label + error state)
- Card (com Header, Content, Footer)
- Badge (status indicators)
- Avatar (foto do perfil com fallback iniciais)
- StarRating (display + input)
- Skeleton (loading states)

## Decisoes

- **Expo managed**: sem eject, OTA updates, build na nuvem (EAS)
- **Nao compartilha UI**: NativeWind e shadcn sao incompativeis, duplicar e ok
- **Compartilha types**: packages/shared (UserRole, DTOs, event types)
- **TanStack Query**: melhor DX que fetch manual, cache automatico
- **expo-secure-store**: mais seguro que AsyncStorage para tokens
- **Bottom tabs**: padrao mobile, 3-4 tabs dependendo do role
