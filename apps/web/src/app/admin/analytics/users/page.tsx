'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  UserPlus,
  UserCheck,
  Eye,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  SimpleBarChart,
  HorizontalBarChart,
} from '@/components/admin/SimpleBarChart';

/* ---------- Types ---------- */

type Period = '7d' | '30d' | '90d';

interface DailyDataPoint {
  date: string;
  value: number;
}

interface UserGrowthAnalytics {
  period: Period;
  totalNewUsers: number;
  dailyNewUsers: DailyDataPoint[];
  growthPercent: number;
  totalUsers: number;
}

interface ProfileAnalytics {
  period: Period;
  newProfiles: number;
  dailyNewProfiles: DailyDataPoint[];
  topViewed: Array<{ id: string; displayName: string; viewsCount: number }>;
  averageViews: number;
  totalActiveProfiles: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/* ---------- Helpers ---------- */

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

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
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
      className={`flex items-center gap-1 text-sm font-medium ${
        isPositive ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-4 w-4" />
      ) : (
        <TrendingDown className="h-4 w-4" />
      )}
      {isPositive ? '+' : ''}
      {value}% vs periodo anterior
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

/* ---------- Main Page ---------- */

export default function UserGrowthAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [userData, setUserData] = useState<UserGrowthAnalytics | null>(null);
  const [profileData, setProfileData] = useState<ProfileAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getToken = useCallback(() => {
    return localStorage.getItem('accessToken') || '';
  }, []);

  const fetchData = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError('');
    try {
      const [usersRes, profilesRes] = await Promise.all([
        api<ApiResponse<UserGrowthAnalytics>>(
          `/admin/analytics/users?period=${period}`,
          { token },
        ),
        api<ApiResponse<ProfileAnalytics>>(
          `/admin/analytics/profiles?period=${period}`,
          { token },
        ),
      ]);
      setUserData(usersRes.data);
      setProfileData(profilesRes.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar dados de usuarios',
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/analytics">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Usuarios e Perfis
            </h1>
            <p className="text-muted-foreground">
              Crescimento dos ultimos {PERIOD_LABELS[period]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
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
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-7 w-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Usuarios
                </CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(userData?.totalUsers ?? 0)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Novos Usuarios
                </CardTitle>
                <UserPlus className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(userData?.totalNewUsers ?? 0)}
                </p>
                {userData && <GrowthBadge value={userData.growthPercent} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Perfis Ativos
                </CardTitle>
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(profileData?.totalActiveProfiles ?? 0)}
                </p>
                <span className="text-xs text-muted-foreground">
                  +{formatNumber(profileData?.newProfiles ?? 0)} novos
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Media de Views
                </CardTitle>
                <Eye className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(profileData?.averageViews ?? 0)}
                </p>
                <span className="text-xs text-muted-foreground">
                  por perfil ativo
                </span>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* User growth chart */}
        <Card>
          <CardHeader>
            <CardTitle>Novos Usuarios por Dia</CardTitle>
            <CardDescription>
              Cadastros diarios nos ultimos {PERIOD_LABELS[period]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[280px] items-center justify-center rounded-lg bg-muted/30">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : userData ? (
              <SimpleBarChart
                data={userData.dailyNewUsers.map((d) => ({
                  label: formatDateLabel(d.date),
                  value: d.value,
                }))}
                color="bg-blue-500"
                height={280}
                formatValue={(v) => `${formatNumber(v)} usuarios`}
              />
            ) : null}
          </CardContent>
        </Card>

        {/* New profiles chart */}
        <Card>
          <CardHeader>
            <CardTitle>Novos Perfis por Dia</CardTitle>
            <CardDescription>
              Perfis criados nos ultimos {PERIOD_LABELS[period]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[280px] items-center justify-center rounded-lg bg-muted/30">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : profileData ? (
              <SimpleBarChart
                data={profileData.dailyNewProfiles.map((d) => ({
                  label: formatDateLabel(d.date),
                  value: d.value,
                }))}
                color="bg-emerald-500"
                height={280}
                formatValue={(v) => `${formatNumber(v)} perfis`}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Top viewed profiles */}
      {profileData && profileData.topViewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Perfis Mais Visualizados</CardTitle>
            <CardDescription>
              Top 10 perfis com mais visualizacoes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={profileData.topViewed.map((p) => ({
                label: p.displayName,
                value: p.viewsCount,
              }))}
              color="bg-violet-500"
              formatValue={(v) => `${formatNumber(v)} views`}
              maxItems={10}
            />
          </CardContent>
        </Card>
      )}

      {/* Daily breakdown table */}
      {userData && userData.dailyNewUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento Diario</CardTitle>
            <CardDescription>
              Novos usuarios por dia no periodo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">
                      Data
                    </th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">
                      Novos Usuarios
                    </th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">
                      % do Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...userData.dailyNewUsers].reverse().map((day, i) => (
                    <tr key={`${day.date}-${i}`} className="hover:bg-muted/50">
                      <td className="py-2.5">{formatFullDate(day.date)}</td>
                      <td className="py-2.5 text-right font-medium">
                        {formatNumber(day.value)}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {userData.totalNewUsers > 0
                          ? (
                              (day.value / userData.totalNewUsers) *
                              100
                            ).toFixed(1)
                          : '0.0'}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
