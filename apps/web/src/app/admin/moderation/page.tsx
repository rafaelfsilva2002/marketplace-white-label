'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
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
import { api, getAccessToken } from '@/lib/api';

type ModerationTypeFilter = 'all' | 'profile' | 'review';
type ModerationEntityType = 'profile' | 'review';

interface ModerationItem {
  id: string;
  type: ModerationEntityType;
  entityId: string;
  displayName?: string;
  comment?: string;
  rating?: number;
  createdAt: string;
  status: string;
}

interface ModerationQueueResponse {
  data: ModerationItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const TYPE_OPTIONS: { value: ModerationTypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'profile', label: 'Perfis' },
  { value: 'review', label: 'Avaliacoes' },
];

const STATUS_LABELS: Record<string, string> = {
  pending_verification: 'Aguardando verificacao',
  pending_moderation: 'Aguardando moderacao',
};

const STATUS_BADGE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_verification: 'outline',
  pending_moderation: 'outline',
};

export default function ModerationPage() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ModerationTypeFilter>('all');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {},
  );

  const fetchQueue = useCallback(async () => {
    if (!getAccessToken()) return;

    setLoading(true);
    setError('');

    try {
      const query = new URLSearchParams({ page: '1', limit: '50' });
      if (filter !== 'all') {
        query.set('type', filter);
      }

      const response = await api<ModerationQueueResponse>(
        `/moderation/queue?${query.toString()}`,
      );
      setItems(response.data);
      setTotal(response.total);
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

  async function handleAction(item: ModerationItem, action: 'approve' | 'reject') {
    if (!getAccessToken()) return;

    setActionLoading((prev) => ({ ...prev, [item.id]: true }));

    try {
      await api(`/moderation/queue/${item.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ type: item.type }),
      });
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Erro ao ${action === 'approve' ? 'aprovar' : 'rejeitar'} item`,
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Moderacao</h1>
          <p className="text-muted-foreground">
            Revise perfis e avaliacoes pendentes
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

      <div className="flex flex-wrap gap-2">
        {TYPE_OPTIONS.map((option) => (
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

      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-64 animate-pulse rounded bg-muted" />
                <div className="h-3 w-52 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium text-muted-foreground">
              Nenhum item para moderar
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {items.length} de {total} {total === 1 ? 'item' : 'itens'} pendente
            {total === 1 ? '' : 's'}
          </p>

          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="secondary">{item.type}</Badge>
                  <Badge
                    variant={STATUS_BADGE_VARIANT[item.status] ?? 'outline'}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="font-medium">
                    ID: <span className="font-mono text-xs">{item.entityId}</span>
                  </p>
                  {item.type === 'profile' && item.displayName && (
                    <p className="text-muted-foreground">
                      Perfil: {item.displayName}
                    </p>
                  )}
                  {item.type === 'review' && (
                    <>
                      {item.rating !== undefined && (
                        <p className="text-muted-foreground">
                          Nota: {item.rating}/5
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        Comentario: {item.comment ?? '-'}
                      </p>
                    </>
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

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 hover:bg-green-50 hover:text-green-700"
                    disabled={actionLoading[item.id]}
                    onClick={() => handleAction(item, 'approve')}
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
                    onClick={() => handleAction(item, 'reject')}
                  >
                    {actionLoading[item.id] ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-1 h-4 w-4" />
                    )}
                    Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
