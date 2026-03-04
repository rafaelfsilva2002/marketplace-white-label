'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  ImageIcon,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

type ModerationStatus = 'pending' | 'approved' | 'rejected';

interface ModerationItem {
  id: string;
  type: string;
  status: ModerationStatus;
  targetId: string;
  photoUrl?: string;
  content?: string;
  aiScore?: number;
  labels?: string[];
  createdAt: string;
}

const STATUS_OPTIONS: { value: ModerationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Rejeitados' },
];

const STATUS_BADGE_VARIANT: Record<
  ModerationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
};

const STATUS_LABELS: Record<ModerationStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ModerationStatus | 'all'>('pending');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );

  const fetchQueue = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const data = await api<ModerationItem[]>(
        `/moderation/queue${params}`,
        { token },
      );
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar fila de moderacao',
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function handleAction(id: string, action: 'approve' | 'reject') {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    setActionLoading((prev) => ({ ...prev, [id]: true }));

    try {
      await api(`/moderation/${id}/${action}`, {
        method: 'POST',
        token,
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Erro ao ${action === 'approve' ? 'aprovar' : 'rejeitar'} item`,
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  function formatScore(score?: number): string {
    if (score === undefined || score === null) return 'N/A';
    return `${(score * 100).toFixed(0)}%`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Moderacao</h1>
          <p className="text-muted-foreground">
            Revise e modere conteudo da plataforma
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchQueue}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="h-16 w-16 animate-pulse rounded bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-9 w-24 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium text-muted-foreground">
              Nenhum item para moderar
            </p>
            <p className="text-sm text-muted-foreground">
              {filter !== 'all'
                ? `Nenhum item com status "${STATUS_LABELS[filter as ModerationStatus]}"`
                : 'A fila de moderacao esta vazia'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Moderation items */}
      {!loading && items.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'itens'} encontrado
            {items.length === 1 ? '' : 's'}
          </p>

          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                {/* Thumbnail / Icon */}
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md border bg-muted">
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt="Conteudo para moderacao"
                      className="h-full w-full rounded-md object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{item.type}</Badge>
                    <Badge variant={STATUS_BADGE_VARIANT[item.status]}>
                      {STATUS_LABELS[item.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Score IA: <span className="font-medium">{formatScore(item.aiScore)}</span>
                    {' | '}
                    ID: <span className="font-mono text-xs">{item.targetId}</span>
                  </p>
                  {item.labels && item.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.labels.map((label) => (
                        <Badge key={label} variant="outline" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                {/* Actions */}
                {item.status === 'pending' && (
                  <div className="flex gap-2 self-end sm:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 hover:bg-green-50 hover:text-green-700"
                      disabled={actionLoading[item.id]}
                      onClick={() => handleAction(item.id, 'approve')}
                    >
                      {actionLoading[item.id] ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-1 h-4 w-4" />
                      )}
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={actionLoading[item.id]}
                      onClick={() => handleAction(item.id, 'reject')}
                    >
                      {actionLoading[item.id] ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="mr-1 h-4 w-4" />
                      )}
                      Rejeitar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
