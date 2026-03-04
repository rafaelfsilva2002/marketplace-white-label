'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Eye, Star, TrendingUp, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface Analytics {
  profileId: string;
  metrics: {
    views30d: number;
    uniqueViews30d: number;
    reviewCount: number;
    avgRating: number;
  };
  viewTrends: Array<{ date: string; views: number }>;
  ratingDistribution: Record<number, number>;
  conversionEstimate: number;
}

interface PlanSuggestion {
  suggestedPlan: string;
  reason: string;
  metrics: {
    views30d: number;
    uniqueViews30d: number;
    reviewCount: number;
    avgRating: number;
  };
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [planSuggestion, setPlanSuggestion] = useState<PlanSuggestion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      try {
        // Mock profile ID for now — in production, get from user's profile
        const profileId = 'mock-profile-id';

        const [analyticsRes, pricingRes] = await Promise.allSettled([
          fetch(`${API_URL}/pricing/analytics/${profileId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/pricing/suggest/${profileId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
          setAnalytics(await analyticsRes.value.json());
        }
        if (pricingRes.status === 'fulfilled' && pricingRes.value.ok) {
          setPlanSuggestion(await pricingRes.value.json());
        }
      } catch {
        // Silent fail for dashboard
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Mock data for display when API is not available
  const metrics = analytics?.metrics || {
    views30d: 342,
    uniqueViews30d: 287,
    reviewCount: 45,
    avgRating: 4.7,
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dashboard Profissional</h1>
        <Button variant="outline">
          <BarChart3 className="h-4 w-4 mr-2" />
          Exportar Relatorio
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Visualizacoes (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{metrics.views30d}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.uniqueViews30d} unicas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avaliacao Media
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{metrics.avgRating.toFixed(1)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.reviewCount} avaliacoes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conversao Estimada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">
                {((analytics?.conversionEstimate || 0.12) * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              de visualizacoes em contatos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Plano Sugerido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <Badge className="text-sm capitalize">
                {planSuggestion?.suggestedPlan || 'professional'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {planSuggestion?.reason || 'Baseado no seu trafego e avaliacoes'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* View Trends */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Visualizacoes nos ultimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-40">
            {(analytics?.viewTrends || Array.from({ length: 30 }, (_, i) => ({
              date: `2024-${String(i + 1).padStart(2, '0')}`,
              views: Math.floor(Math.random() * 20) + 5,
            }))).map((trend, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t"
                style={{ height: `${Math.max((trend.views / 25) * 100, 5)}%` }}
                title={`${trend.date}: ${trend.views} views`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>30 dias atras</span>
            <span>Hoje</span>
          </div>
        </CardContent>
      </Card>

      {/* Rating Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuicao de Avaliacoes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = analytics?.ratingDistribution?.[rating] ||
                (rating === 5 ? 25 : rating === 4 ? 12 : rating === 3 ? 5 : rating === 2 ? 2 : 1);
              const total = Object.values(analytics?.ratingDistribution || { 5: 25, 4: 12, 3: 5, 2: 2, 1: 1 })
                .reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? (count / total) * 100 : 0;

              return (
                <div key={rating} className="flex items-center gap-3">
                  <span className="text-sm w-16 flex items-center gap-1">
                    {rating} <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-8">{count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
