'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Users,
  UserCheck,
  ShieldAlert,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Search,
  BarChart3,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  SimpleBarChart,
  HorizontalBarChart,
} from '@/components/admin/SimpleBarChart';

/* ---------- Types ---------- */

type Period = '7d' | '30d' | '90d';

interface OverviewDashboard {
  revenue: { total: number; growthPercent: number };
  users: { total: number; newThisPeriod: number; growthPercent: number };
  profiles: { active: number; newThisPeriod: number };
  moderation: { pending: number; approvalRate: number };
  subscriptions: { active: number };
  topCategories: Array<{ name: string; profileCount: number }>;
}

interface DailyDataPoint {
  date: string;
  value: number;
}

interface RevenueAnalytics {
  period: Period;
  totalRevenue: number;
  dailyRevenue: DailyDataPoint[];
  averageDailyRevenue: number;
  growthPercent: number;
  transactionCount: number;
}

interface UserGrowthAnalytics {
  period: Period;
  totalNewUsers: number;
  dailyNewUsers: DailyDataPoint[];
  growthPercent: number;
  totalUsers: number;
}

interface SearchAnalytics {
  period: Period;
  totalSearches: number;
  topSearchTerms: Array<{ term: string; count: number }>;
  dailySearches: DailyDataPoint[];
}

interface CategoryAnalytics {
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    profileCount: number;
  }>;
  totalCategories: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
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

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

/* ---------- Sub-components ---------- */

function GrowthBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <div
      className={`flex items-center gap-1 text-xs font-medium ${
        isPositive ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      {isPositive ? '+' : ''}
      {value}%
    </div>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const periods: Period[] = ['7d', '30d', '90d'];
  return (
    <div className="flex gap-1 rounded-lg border p-1">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === p
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-7 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-4 w-16 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg bg-muted/30"
      style={{ height }}
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
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

/* ---------- Main Page ---------- */

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [overview, setOverview] = useState<OverviewDashboard | null>(null);
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [userGrowth, setUserGrowth] = useState<UserGrowthAnalytics | null>(
    null,
  );
  const [search, setSearch] = useState<SearchAnalytics | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryAnalytics | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getToken = useCallback(() => {
    return localStorage.getItem('accessToken') || '';
  }, []);

  const fetchAll = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const [overviewRes, revenueRes, usersRes, searchRes, catRes] =
        await Promise.all([
          api<ApiResponse<OverviewDashboard>>('/admin/analytics/overview', {
            token,
          }),
          api<ApiResponse<RevenueAnalytics>>(
            `/admin/analytics/revenue?period=${period}`,
            { token },
          ),
          api<ApiResponse<UserGrowthAnalytics>>(
            `/admin/analytics/users?period=${period}`,
            { token },
          ),
          api<ApiResponse<SearchAnalytics>>(
            `/admin/analytics/search?period=${period}`,
            { token },
          ),
          api<ApiResponse<CategoryAnalytics>>(
            '/admin/analytics/categories',
            { token },
          ),
        ]);

      setOverview(overviewRes.data);
      setRevenue(revenueRes.data);
      setUserGrowth(usersRes.data);
      setSearch(searchRes.data);
      setCategoryData(catRes.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar dados de analytics',
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, period]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Metricas detalhadas da plataforma
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchAll} />}

      {/* Overview stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : overview ? (
          <>
            <Card className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Receita ({PERIOD_LABELS[period]})
                </CardTitle>
                <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(overview.revenue.total)}
                </p>
                <GrowthBadge value={overview.revenue.growthPercent} />
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Usuarios
                </CardTitle>
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(overview.users.total)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    +{formatNumber(overview.users.newThisPeriod)} novos
                  </span>
                  <GrowthBadge value={overview.users.growthPercent} />
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Perfis Ativos
                </CardTitle>
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                  <UserCheck className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(overview.profiles.active)}
                </p>
                <span className="text-xs text-muted-foreground">
                  +{formatNumber(overview.profiles.newThisPeriod)} novos
                </span>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Moderacao Pendente
                </CardTitle>
                <div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-900/30">
                  <ShieldAlert className="h-5 w-5 text-orange-600" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(overview.moderation.pending)}
                </p>
                <span className="text-xs text-muted-foreground">
                  {overview.moderation.approvalRate}% taxa aprovacao
                </span>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Assinaturas Ativas
                </CardTitle>
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(overview.subscriptions.active)}
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Receita Diaria</CardTitle>
                <CardDescription>
                  {revenue
                    ? `Total: ${formatCurrency(revenue.totalRevenue)} | Media: ${formatCurrency(revenue.averageDailyRevenue)}/dia`
                    : `Receita nos ultimos ${PERIOD_LABELS[period]}`}
                </CardDescription>
              </div>
              <Link href="/admin/analytics/revenue">
                <Button variant="ghost" size="sm">
                  Detalhes
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ChartSkeleton />
            ) : revenue ? (
              <SimpleBarChart
                data={revenue.dailyRevenue.map((d) => ({
                  label: formatDateLabel(d.date),
                  value: d.value,
                }))}
                color="bg-emerald-500"
                height={200}
                formatValue={(v) => formatCurrency(v)}
              />
            ) : null}
          </CardContent>
        </Card>

        {/* User growth chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Crescimento Usuarios</CardTitle>
                <CardDescription>
                  {userGrowth
                    ? `${formatNumber(userGrowth.totalNewUsers)} novos nos ultimos ${PERIOD_LABELS[period]}`
                    : `Novos usuarios nos ultimos ${PERIOD_LABELS[period]}`}
                </CardDescription>
              </div>
              <Link href="/admin/analytics/users">
                <Button variant="ghost" size="sm">
                  Detalhes
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ChartSkeleton />
            ) : userGrowth ? (
              <SimpleBarChart
                data={userGrowth.dailyNewUsers.map((d) => ({
                  label: formatDateLabel(d.date),
                  value: d.value,
                }))}
                color="bg-blue-500"
                height={200}
                formatValue={(v) => formatNumber(v)}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Search terms + Categories */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top search terms */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Termos de Busca</CardTitle>
                <CardDescription>
                  {search
                    ? `${formatNumber(search.totalSearches)} buscas nos ultimos ${PERIOD_LABELS[period]}`
                    : 'Termos mais buscados'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ChartSkeleton height={250} />
            ) : search && search.topSearchTerms.length > 0 ? (
              <HorizontalBarChart
                data={search.topSearchTerms.map((t) => ({
                  label: t.term,
                  value: t.count,
                }))}
                color="bg-violet-500"
                formatValue={(v) => formatNumber(v)}
                maxItems={8}
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Nenhum termo de busca registrado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category distribution */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">
                  Distribuicao por Categoria
                </CardTitle>
                <CardDescription>
                  {categoryData
                    ? `${categoryData.totalCategories} categorias ativas`
                    : 'Perfis por categoria'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ChartSkeleton height={250} />
            ) : categoryData && categoryData.categories.length > 0 ? (
              <HorizontalBarChart
                data={categoryData.categories.map((c) => ({
                  label: c.name,
                  value: c.profileCount,
                }))}
                color="bg-amber-500"
                formatValue={(v) => `${formatNumber(v)} perfis`}
                maxItems={8}
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Nenhuma categoria cadastrada
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
