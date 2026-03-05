'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Receipt,
  Calendar,
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
import { SimpleBarChart } from '@/components/admin/SimpleBarChart';

/* ---------- Types ---------- */

type Period = '7d' | '30d' | '90d';

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

export default function RevenueAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<RevenueAnalytics | null>(null);
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
      const res = await api<ApiResponse<RevenueAnalytics>>(
        `/admin/analytics/revenue?period=${period}`,
        { token },
      );
      setData(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar dados de receita',
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
              Receita Detalhada
            </h1>
            <p className="text-muted-foreground">
              Analise financeira dos ultimos {PERIOD_LABELS[period]}
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
                <div className="h-7 w-28 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))
        ) : data ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Receita Total
                </CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.totalRevenue)}
                </p>
                <GrowthBadge value={data.growthPercent} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Media Diaria
                </CardTitle>
                <Calendar className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(data.averageDailyRevenue)}
                </p>
                <span className="text-xs text-muted-foreground">por dia</span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Transacoes
                </CardTitle>
                <Receipt className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatNumber(data.transactionCount)}
                </p>
                <span className="text-xs text-muted-foreground">
                  no periodo
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Ticket Medio
                </CardTitle>
                <DollarSign className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {data.transactionCount > 0
                    ? formatCurrency(
                        Math.round(data.totalRevenue / data.transactionCount),
                      )
                    : 'R$ 0,00'}
                </p>
                <span className="text-xs text-muted-foreground">
                  por transacao
                </span>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Revenue chart (large) */}
      <Card>
        <CardHeader>
          <CardTitle>Receita Diaria</CardTitle>
          <CardDescription>
            Distribuicao da receita dia a dia nos ultimos {PERIOD_LABELS[period]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-[300px] items-center justify-center rounded-lg bg-muted/30">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : data ? (
            <SimpleBarChart
              data={data.dailyRevenue.map((d) => ({
                label: formatDateLabel(d.date),
                value: d.value,
              }))}
              color="bg-emerald-500"
              height={300}
              formatValue={(v) => formatCurrency(v)}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* Daily breakdown table */}
      {data && data.dailyRevenue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento Diario</CardTitle>
            <CardDescription>Receita por dia no periodo</CardDescription>
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
                      Receita
                    </th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">
                      % do Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...data.dailyRevenue].reverse().map((day, i) => (
                    <tr key={`${day.date}-${i}`} className="hover:bg-muted/50">
                      <td className="py-2.5">{formatFullDate(day.date)}</td>
                      <td className="py-2.5 text-right font-medium">
                        {formatCurrency(day.value)}
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground">
                        {data.totalRevenue > 0
                          ? (
                              (day.value / data.totalRevenue) *
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
