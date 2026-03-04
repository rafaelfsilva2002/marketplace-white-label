'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  AlertTriangle,
  DollarSign,
  CreditCard,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';

interface AdminStats {
  totalUsers: number;
  activeProfiles: number;
  pendingModeration: number;
  totalGmv: number;
  activeSubscriptions: number;
}

interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchStats() {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      try {
        const data = await api<AdminStats>('/admin/stats', { token });
        setStats(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar estatisticas',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value / 100);
  }

  function formatNumber(value: number): string {
    return new Intl.NumberFormat('pt-BR').format(value);
  }

  const statCards: StatCard[] = stats
    ? [
        {
          label: 'Total de Usuarios',
          value: formatNumber(stats.totalUsers),
          icon: Users,
          color: 'text-blue-500',
        },
        {
          label: 'Perfis Ativos',
          value: formatNumber(stats.activeProfiles),
          icon: UserCheck,
          color: 'text-green-500',
        },
        {
          label: 'Moderacao Pendente',
          value: formatNumber(stats.pendingModeration),
          icon: AlertTriangle,
          color: 'text-orange-500',
        },
        {
          label: 'GMV Total',
          value: formatCurrency(stats.totalGmv),
          icon: DollarSign,
          color: 'text-emerald-500',
        },
        {
          label: 'Assinaturas Ativas',
          value: formatNumber(stats.activeSubscriptions),
          icon: CreditCard,
          color: 'text-purple-500',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visao geral da plataforma
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-5 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : statCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{card.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
