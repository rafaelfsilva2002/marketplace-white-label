'use client';

import { useEffect, useState, useCallback } from 'react';
import { Star, Loader2, MessageSquare, User } from 'lucide-react';
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

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  authorName: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  createdAt: string;
}

interface ReviewsResponse {
  data: Review[];
  total: number;
  page: number;
  limit: number;
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
// Helper: sentiment badge
// ---------------------------------------------------------------------------

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;

  const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    positive: { label: 'Positivo', variant: 'default' },
    neutral: { label: 'Neutro', variant: 'secondary' },
    negative: { label: 'Negativo', variant: 'destructive' },
  };

  const entry = config[sentiment];
  if (!entry) return null;

  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Reviews Page
// ---------------------------------------------------------------------------

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);

  const LIMIT = 10;

  // -------------------------------------------------------------------------
  // Fetch profile id first, then reviews
  // -------------------------------------------------------------------------

  const fetchProfileId = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const profile = await api<{ id: string }>('/profiles/me', { token });
    return profile.id;
  }, []);

  const fetchReviews = useCallback(
    async (pid: string, pageNum: number, append = false) => {
      const token = localStorage.getItem('token');
      if (!token) return;

      if (append) {
        setLoadingMore(true);
      }

      try {
        // The endpoint may return an array directly or a paginated wrapper.
        // We handle both formats gracefully.
        const raw = await api<ReviewsResponse | Review[]>(
          `/profiles/${pid}/reviews?page=${pageNum}&limit=${LIMIT}`,
          { token },
        );

        let fetchedReviews: Review[];
        let fetchedTotal: number;

        if (Array.isArray(raw)) {
          fetchedReviews = raw;
          fetchedTotal = raw.length;
        } else {
          fetchedReviews = raw.data;
          fetchedTotal = raw.total;
        }

        if (append) {
          setReviews((prev) => [...prev, ...fetchedReviews]);
        } else {
          setReviews(fetchedReviews);
        }
        setTotal(fetchedTotal);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar avaliacoes',
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        const pid = await fetchProfileId();
        if (pid) {
          setProfileId(pid);
          await fetchReviews(pid, 1);
        } else {
          setLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao carregar perfil',
        );
        setLoading(false);
      }
    })();
  }, [fetchProfileId, fetchReviews]);

  // -------------------------------------------------------------------------
  // Load more handler
  // -------------------------------------------------------------------------

  function handleLoadMore() {
    if (!profileId) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchReviews(profileId, nextPage, true);
  }

  const hasMore = reviews.length < total;

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Carregando avaliacoes...
          </p>
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
          <h1 className="text-2xl font-bold tracking-tight">Avaliacoes</h1>
          <p className="text-muted-foreground">
            Veja o que seus clientes dizem sobre voce
          </p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avaliacoes</h1>
        <p className="text-muted-foreground">
          Veja o que seus clientes dizem sobre voce
        </p>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumo</CardTitle>
          <CardDescription>
            Total de {total} {total === 1 ? 'avaliacao' : 'avaliacoes'} recebidas
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Nenhuma avaliacao recebida ainda
            </p>
            <p className="text-xs text-muted-foreground">
              Quando seus clientes avaliarem seu servico, as avaliacoes
              aparecao aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  {/* Header: author + date + rating */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <User className="h-5 w-5 text-muted-foreground" />
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
                              month: 'long',
                              year: 'numeric',
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <SentimentBadge sentiment={review.sentiment} />
                      <StarRating rating={review.rating} />
                    </div>
                  </div>

                  {/* Comment */}
                  {review.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed pl-[52px]">
                      {review.comment}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  'Carregar mais avaliacoes'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
