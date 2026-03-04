'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Eye,
  Star,
  CheckCircle,
  XCircle,
  Pencil,
  MessageSquare,
  CreditCard,
  Loader2,
  User,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  services: string[];
  photos: string[];
  isVerified: boolean;
  isActive: boolean;
  viewsCount?: number;
  avgRating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  authorName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helper: render star rating
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`h-4 w-4 ${
            value <= rating
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const profileData = await api<Profile>('/profiles/me', { token });
      setProfile(profileData);

      // Fetch recent reviews for this profile
      try {
        const reviewsData = await api<Review[]>(
          `/profiles/${profileData.id}/reviews?limit=5`,
          { token },
        );
        setReviews(reviewsData);
      } catch {
        // Reviews endpoint may not be available yet — silently ignore
        setReviews([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar dados do perfil',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando painel...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Painel Profissional
          </h1>
          <p className="text-muted-foreground">
            Gerencie seu perfil e acompanhe suas metricas
          </p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // No profile state
  // -------------------------------------------------------------------------

  if (!profile) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Painel Profissional
          </h1>
          <p className="text-muted-foreground">
            Gerencie seu perfil e acompanhe suas metricas
          </p>
        </div>
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <User className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              Nenhum perfil encontrado. Faca login ou crie um perfil
              profissional.
            </p>
            <Button asChild>
              <Link href="/login">Fazer Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Computed values
  // -------------------------------------------------------------------------

  const viewsCount = profile.viewsCount ?? 0;
  const avgRating = profile.avgRating ?? 0;
  const reviewCount = profile.reviewCount ?? 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Painel Profissional
        </h1>
        <p className="text-muted-foreground">
          Bem-vindo(a), {profile.displayName}! Gerencie seu perfil e acompanhe
          suas metricas.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Views */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Visualizacoes
            </CardTitle>
            <Eye className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR').format(viewsCount)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Total de visitas ao seu perfil
            </p>
          </CardContent>
        </Card>

        {/* Rating */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avaliacao Media
            </CardTitle>
            <Star className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">
                {avgRating > 0 ? avgRating.toFixed(1) : '--'}
              </p>
              {avgRating > 0 && <StarRating rating={Math.round(avgRating)} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {reviewCount}{' '}
              {reviewCount === 1 ? 'avaliacao' : 'avaliacoes'} no total
            </p>
          </CardContent>
        </Card>

        {/* Active status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status do Perfil
            </CardTitle>
            {profile.isActive ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={profile.isActive ? 'default' : 'destructive'}
              >
                {profile.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
              {profile.isVerified && (
                <Badge variant="secondary">Verificado</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {profile.isActive
                ? 'Seu perfil esta visivel para clientes'
                : 'Seu perfil nao esta visivel no momento'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acoes Rapidas</CardTitle>
          <CardDescription>
            Acesse rapidamente as funcionalidades mais utilizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button variant="outline" className="h-auto py-4 justify-start gap-3" asChild>
              <Link href="/dashboard/profile">
                <Pencil className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Editar Perfil</p>
                  <p className="text-xs text-muted-foreground">
                    Atualize suas informacoes
                  </p>
                </div>
              </Link>
            </Button>

            <Button variant="outline" className="h-auto py-4 justify-start gap-3" asChild>
              <Link href="/dashboard/reviews">
                <MessageSquare className="h-5 w-5 text-yellow-500 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Ver Avaliacoes</p>
                  <p className="text-xs text-muted-foreground">
                    Confira o que dizem sobre voce
                  </p>
                </div>
              </Link>
            </Button>

            <Button variant="outline" className="h-auto py-4 justify-start gap-3" asChild>
              <Link href="/dashboard/subscription">
                <CreditCard className="h-5 w-5 text-purple-500 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Gerenciar Assinatura</p>
                  <p className="text-xs text-muted-foreground">
                    Plano e pagamentos
                  </p>
                </div>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent reviews */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Avaliacoes Recentes</CardTitle>
              <CardDescription>
                Ultimas avaliacoes recebidas no seu perfil
              </CardDescription>
            </div>
            {reviews.length > 0 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/reviews">Ver todas</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhuma avaliacao ainda
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  As avaliacoes dos seus clientes aparecao aqui
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="flex flex-col gap-2 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {review.authorName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(review.createdAt).toLocaleDateString(
                            'pt-BR',
                            {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            },
                          )}
                        </p>
                      </div>
                    </div>
                    <StarRating rating={review.rating} />
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {review.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
