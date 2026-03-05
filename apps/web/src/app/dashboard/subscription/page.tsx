'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2,
  CreditCard,
  CheckCircle,
  XCircle,
  Zap,
  Crown,
  Shield,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, getAccessToken } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'inactive';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  highlighted?: boolean;
}

// ---------------------------------------------------------------------------
// Static: available plans (shown when API plan listing is not available)
// ---------------------------------------------------------------------------

const AVAILABLE_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 0,
    interval: 'month',
    features: [
      'Perfil basico',
      'Ate 3 fotos',
      'Aparece nos resultados de busca',
    ],
  },
  {
    id: 'pro',
    name: 'Profissional',
    price: 49.9,
    interval: 'month',
    highlighted: true,
    features: [
      'Perfil completo',
      'Ate 15 fotos',
      'Destaque nos resultados',
      'Selo verificado',
      'Estatisticas avancadas',
      'Suporte prioritario',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 99.9,
    interval: 'month',
    features: [
      'Tudo do Profissional',
      'Fotos ilimitadas',
      'Posicao de topo na busca',
      'Badge exclusivo',
      'Relatorios de performance',
      'Gerente de conta dedicado',
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: Subscription['status']): string {
  const map: Record<Subscription['status'], string> = {
    active: 'Ativa',
    canceled: 'Cancelada',
    past_due: 'Pagamento pendente',
    trialing: 'Periodo de teste',
    inactive: 'Inativa',
  };
  return map[status] ?? status;
}

function statusVariant(
  status: Subscription['status'],
): 'default' | 'secondary' | 'destructive' {
  if (status === 'active' || status === 'trialing') return 'default';
  if (status === 'past_due') return 'secondary';
  return 'destructive';
}

function planIcon(planId: string) {
  if (planId === 'premium') return <Crown className="h-5 w-5 text-yellow-500" />;
  if (planId === 'pro') return <Zap className="h-5 w-5 text-purple-500" />;
  return <Shield className="h-5 w-5 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
// Subscription Page
// ---------------------------------------------------------------------------

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');

  // -------------------------------------------------------------------------
  // Fetch current subscription
  // -------------------------------------------------------------------------

  const fetchSubscription = useCallback(async () => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }

    try {
      const data = await api<Subscription>('/subscriptions/current');
      setSubscription(data);
    } catch {
      // No active subscription — user is on free plan
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // -------------------------------------------------------------------------
  // Upgrade handler
  // -------------------------------------------------------------------------

  async function handleUpgrade(planId: string) {
    if (!getAccessToken()) return;

    setActionLoading(planId);
    setActionMessage('');

    try {
      await api('/subscriptions/upgrade', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      setActionMessage('Assinatura atualizada com sucesso!');
      await fetchSubscription();
    } catch (err) {
      setActionMessage(
        err instanceof Error
          ? err.message
          : 'Erro ao atualizar assinatura',
      );
    } finally {
      setActionLoading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Cancel handler
  // -------------------------------------------------------------------------

  async function handleCancel() {
    if (!getAccessToken() || !subscription) return;

    const confirmed = window.confirm(
      'Tem certeza que deseja cancelar sua assinatura? Voce ainda tera acesso ate o fim do periodo atual.',
    );
    if (!confirmed) return;

    setActionLoading('cancel');
    setActionMessage('');

    try {
      await api('/subscriptions/cancel', {
        method: 'POST',
      });
      setActionMessage('Assinatura cancelada. Acesso mantido ate o fim do periodo.');
      await fetchSubscription();
    } catch (err) {
      setActionMessage(
        err instanceof Error
          ? err.message
          : 'Erro ao cancelar assinatura',
      );
    } finally {
      setActionLoading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Carregando assinatura...
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
          <h1 className="text-2xl font-bold tracking-tight">Assinatura</h1>
          <p className="text-muted-foreground">
            Gerencie seu plano e pagamentos
          </p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Determine current plan id
  // -------------------------------------------------------------------------

  const currentPlanId = subscription?.planId ?? 'free';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assinatura</h1>
        <p className="text-muted-foreground">
          Gerencie seu plano e pagamentos
        </p>
      </div>

      {/* Action message */}
      {actionMessage && (
        <div
          className={`rounded-md p-4 text-sm ${
            actionMessage.toLowerCase().includes('erro')
              ? 'bg-destructive/10 text-destructive'
              : 'bg-green-500/10 text-green-700'
          }`}
        >
          {actionMessage}
        </div>
      )}

      {/* Current subscription card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Plano Atual</CardTitle>
              <CardDescription>
                Detalhes da sua assinatura vigente
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {planIcon(subscription.planId)}
                <div>
                  <p className="text-lg font-semibold">
                    {subscription.planName}
                  </p>
                  <Badge variant={statusVariant(subscription.status)}>
                    {statusLabel(subscription.status)}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Proxima cobranca</p>
                  <p className="font-medium">
                    {new Date(
                      subscription.currentPeriodEnd,
                    ).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status de renovacao</p>
                  <p className="font-medium">
                    {subscription.cancelAtPeriodEnd
                      ? 'Nao sera renovada'
                      : 'Renovacao automatica'}
                  </p>
                </div>
              </div>

              {/* Cancel button */}
              {subscription.status === 'active' &&
                !subscription.cancelAtPeriodEnd && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleCancel}
                      disabled={actionLoading === 'cancel'}
                    >
                      {actionLoading === 'cancel' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cancelando...
                        </>
                      ) : (
                        'Cancelar Assinatura'
                      )}
                    </Button>
                  </div>
                )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-semibold">Plano Gratuito</p>
                <p className="text-sm text-muted-foreground">
                  Voce esta usando o plano gratuito. Faca upgrade para
                  desbloquear mais recursos.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available plans */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Planos Disponiveis</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE_PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlanId;

            return (
              <Card
                key={plan.id}
                className={
                  plan.highlighted
                    ? 'border-primary shadow-md'
                    : ''
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {planIcon(plan.id)}
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                    </div>
                    {isCurrent && (
                      <Badge variant="secondary">Atual</Badge>
                    )}
                    {plan.highlighted && !isCurrent && (
                      <Badge>Popular</Badge>
                    )}
                  </div>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">
                      {plan.price === 0
                        ? 'Gratis'
                        : `R$ ${plan.price.toFixed(2).replace('.', ',')}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-sm text-muted-foreground">
                        /{plan.interval === 'month' ? 'mes' : 'ano'}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm"
                      >
                        <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Plano Atual
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? 'default' : 'outline'}
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={actionLoading === plan.id}
                    >
                      {actionLoading === plan.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processando...
                        </>
                      ) : plan.price === 0 ? (
                        'Usar Gratuito'
                      ) : (
                        'Fazer Upgrade'
                      )}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
