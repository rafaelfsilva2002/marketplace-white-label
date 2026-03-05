'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Eye,
  DollarSign,
  ShieldAlert,
  Activity,
  CreditCard,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  UserCheck,
  BarChart3,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

/* ---------- Types ---------- */

interface AdminStats {
  totalUsers: number;
  activeProfiles: number;
  pendingModerationItems: number;
  totalGmv: number;
  activeSubscriptions: number;
}

interface RecentUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean | null;
  createdAt: string;
}

interface PaginatedUsers {
  data: RecentUser[];
  total: number;
  limit: number;
  offset: number;
}

interface StatCardConfig {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

/* ---------- Helpers ---------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / 100);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'agora mesmo';
  if (diffMinutes < 60) return `${diffMinutes}min atras`;
  if (diffHours < 24) return `${diffHours}h atras`;
  if (diffDays < 7) return `${diffDays}d atras`;
  return formatDate(dateStr);
}

function getRoleBadgeVariant(role: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (role) {
    case 'admin':
      return 'destructive';
    case 'moderator':
      return 'default';
    case 'professional':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'moderator':
      return 'Moderador';
    case 'professional':
      return 'Profissional';
    case 'user':
      return 'Usuario';
    default:
      return role;
  }
}

/* ---------- Skeleton Components ---------- */

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function ListItemSkeleton() {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        <div className="space-y-1.5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
    </div>
  );
}

/* ---------- Error Banner ---------- */

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <p className="flex-1 text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

/* ---------- Quick Links ---------- */

const QUICK_LINKS = [
  {
    href: '/admin/analytics',
    label: 'Analytics',
    description: 'Metricas detalhadas da plataforma',
    icon: BarChart3,
    color: 'text-emerald-500',
  },
  {
    href: '/admin/moderation',
    label: 'Ver Fila de Moderacao',
    description: 'Revisar perfis e fotos pendentes',
    icon: Eye,
    color: 'text-orange-500',
  },
  {
    href: '/admin/usuarios',
    label: 'Gerenciar Usuarios',
    description: 'Visualizar e editar contas',
    icon: Users,
    color: 'text-blue-500',
  },
  {
    href: '/admin/workflows',
    label: 'Workflows',
    description: 'Gerenciar fluxos de automacao',
    icon: Activity,
    color: 'text-purple-500',
  },
];

/* ---------- Main Page ---------- */

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [usersError, setUsersError] = useState('');

  const getToken = useCallback(() => {
    return localStorage.getItem('accessToken') || '';
  }, []);

  const fetchStats = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setStatsLoading(true);
    setStatsError('');
    try {
      const data = await api<AdminStats>('/admin/stats', { token });
      setStats(data);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : 'Erro ao carregar estatisticas',
      );
    } finally {
      setStatsLoading(false);
    }
  }, [getToken]);

  const fetchRecentUsers = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await api<PaginatedUsers>('/admin/users?limit=5&offset=0', { token });
      setRecentUsers(data.data);
    } catch (err) {
      setUsersError(
        err instanceof Error ? err.message : 'Erro ao carregar usuarios recentes',
      );
    } finally {
      setUsersLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchStats();
    fetchRecentUsers();
  }, [fetchStats, fetchRecentUsers]);

  const statCards: StatCardConfig[] = stats
    ? [
        {
          label: 'Total de Usuarios',
          value: formatNumber(stats.totalUsers),
          icon: Users,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        },
        {
          label: 'Perfis Ativos',
          value: formatNumber(stats.activeProfiles),
          icon: UserCheck,
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/30',
        },
        {
          label: 'Moderacao Pendente',
          value: formatNumber(stats.pendingModerationItems),
          icon: ShieldAlert,
          color: 'text-orange-600',
          bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        },
        {
          label: 'GMV Total',
          value: formatCurrency(stats.totalGmv),
          icon: DollarSign,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
        },
        {
          label: 'Assinaturas Ativas',
          value: formatNumber(stats.activeSubscriptions),
          icon: CreditCard,
          color: 'text-purple-600',
          bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Visao geral da plataforma
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchStats();
            fetchRecentUsers();
          }}
          disabled={statsLoading && usersLoading}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${
              statsLoading || usersLoading ? 'animate-spin' : ''
            }`}
          />
          Atualizar
        </Button>
      </div>

      {/* Stats error */}
      {statsError && (
        <ErrorBanner message={statsError} onRetry={fetchStats} />
      )}

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statsLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))
          : statCards.map((card) => (
              <Card key={card.label} className="relative overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <div className={`rounded-lg p-2 ${card.bgColor}`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{card.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Bottom sections: Recent Users + Quick Links */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent users */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Usuarios Recentes</CardTitle>
                <CardDescription>
                  Ultimos usuarios cadastrados na plataforma
                </CardDescription>
              </div>
              <Link href="/admin/usuarios">
                <Button variant="ghost" size="sm">
                  Ver todos
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {usersError ? (
              <ErrorBanner message={usersError} onRetry={fetchRecentUsers} />
            ) : usersLoading ? (
              <div className="divide-y">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ListItemSkeleton key={i} />
                ))}
              </div>
            ) : recentUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="mb-2 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Nenhum usuario encontrado
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase text-muted-foreground">
                        {(user.name || user.email).charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {user.name || user.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email} &middot; {formatRelativeDate(user.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acesso Rapido</CardTitle>
            <CardDescription>
              Atalhos para as areas mais usadas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <link.icon className={`h-5 w-5 ${link.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {link.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Navegue tambem pelo menu lateral
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
