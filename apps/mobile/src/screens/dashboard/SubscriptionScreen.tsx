import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/api';
import { useState, useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';
import type { SubscriptionInfo } from '@/services/payments';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Subscription'>;

const plans = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 'R$ 0',
    priceDetail: 'para sempre',
    features: ['Perfil basico', '5 fotos', 'Busca padrao'],
  },
  {
    id: 'basic',
    name: 'Basico',
    price: 'R$ 29/mes',
    priceDetail: 'cobrado mensalmente',
    features: [
      'Perfil basico',
      'Filtros avancados',
      'Mensagens',
    ],
  },
  {
    id: 'professional',
    name: 'Profissional',
    price: 'R$ 49/mes',
    priceDetail: 'cobrado mensalmente',
    features: [
      'Perfil destaque',
      '20 fotos',
      'Busca semantica',
      'Analytics',
      'Suporte prioritario',
      'Recomendacoes IA',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 99/mes',
    priceDetail: 'cobrado mensalmente',
    features: [
      'Tudo do Profissional',
      'Fotos ilimitadas',
      'Prioridade na busca',
      'Suporte dedicado',
      'Branding personalizado',
      'Acesso a API',
    ],
  },
];

function getPlanOrder(planId: string): number {
  const order: Record<string, number> = {
    free: 0,
    basic: 1,
    professional: 2,
    premium: 3,
  };
  return order[planId] ?? 0;
}

export function SubscriptionScreen({ navigation }: Props) {
  const {
    data: current,
    isLoading,
    refetch,
  } = useApiQuery<SubscriptionInfo | null>(
    ['subscription'],
    '/subscriptions/current',
  );

  const [actionPlanId, setActionPlanId] = useState('');
  const [canceling, setCanceling] = useState(false);

  const currentPlanId = current?.plan ?? 'free';
  const currentPlanOrder = getPlanOrder(currentPlanId);
  const isCancelPending = current?.cancelAtPeriodEnd === 'true';

  const handleUpgrade = useCallback(
    async (planId: string) => {
      const targetOrder = getPlanOrder(planId);
      const action = targetOrder > currentPlanOrder ? 'Upgrade' : 'Downgrade';

      Alert.alert(
        `Confirmar ${action}`,
        `Deseja mudar para o plano ${plans.find((p) => p.id === planId)?.name}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar',
            onPress: async () => {
              setActionPlanId(planId);
              try {
                await api('/subscriptions/upgrade', {
                  method: 'POST',
                  body: { planId },
                });
                Alert.alert('Sucesso', 'Plano atualizado com sucesso!');
                refetch();
              } catch (e: any) {
                Alert.alert('Erro', e.message ?? 'Falha ao alterar plano.');
              } finally {
                setActionPlanId('');
              }
            },
          },
        ],
      );
    },
    [currentPlanOrder, refetch],
  );

  const handleCancel = useCallback(async () => {
    Alert.alert(
      'Cancelar Assinatura',
      'Tem certeza que deseja cancelar? Voce mantera o acesso ate o final do periodo atual.',
      [
        { text: 'Nao', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            setCanceling(true);
            try {
              await api('/subscriptions/cancel', { method: 'POST' });
              Alert.alert(
                'Assinatura Cancelada',
                'Sua assinatura sera cancelada ao final do periodo atual.',
              );
              refetch();
            } catch (e: any) {
              Alert.alert('Erro', e.message ?? 'Falha ao cancelar assinatura.');
            } finally {
              setCanceling(false);
            }
          },
        },
      ],
    );
  }, [refetch]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>
            ← Voltar
          </Button>
          <Text className="text-xl font-bold text-foreground ml-2">
            Assinatura
          </Text>
        </View>

        {/* Current plan status banner */}
        {!isLoading && current && current.plan !== 'free' && (
          <Card className="mb-4 border-primary-500 border">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-sm font-semibold text-foreground">
                Plano atual:{' '}
                {plans.find((p) => p.id === current.plan)?.name ?? current.plan}
              </Text>
              <Badge
                variant={
                  current.status === 'active'
                    ? 'success'
                    : current.status === 'past_due'
                      ? 'warning'
                      : 'destructive'
                }
              >
                {current.status === 'active'
                  ? 'Ativo'
                  : current.status === 'past_due'
                    ? 'Pagamento pendente'
                    : current.status}
              </Badge>
            </View>
            {current.currentPeriodEnd && (
              <Text className="text-xs text-muted-foreground">
                Periodo atual ate:{' '}
                {new Date(current.currentPeriodEnd).toLocaleDateString('pt-BR')}
              </Text>
            )}
            {isCancelPending && (
              <Badge variant="warning">Cancelamento agendado</Badge>
            )}
          </Card>
        )}

        {isLoading ? (
          <View>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-48 mb-3" />
            ))}
          </View>
        ) : (
          plans.map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            const targetOrder = getPlanOrder(plan.id);
            const isUpgrade = targetOrder > currentPlanOrder;
            const isDowngrade = targetOrder < currentPlanOrder;

            let actionLabel = 'Selecionar';
            if (isUpgrade) actionLabel = 'Fazer Upgrade';
            if (isDowngrade) actionLabel = 'Fazer Downgrade';

            return (
              <Card
                key={plan.id}
                className={`mb-3 ${isCurrent ? 'border-primary-500 border-2' : ''}`}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-lg font-bold text-foreground">
                    {plan.name}
                  </Text>
                  {isCurrent && <Badge variant="success">Atual</Badge>}
                </View>
                <Text className="text-xl font-bold text-primary-600 mb-1">
                  {plan.price}
                </Text>
                <Text className="text-xs text-muted-foreground mb-2">
                  {plan.priceDetail}
                </Text>
                {plan.features.map((f, i) => (
                  <Text key={i} className="text-sm text-foreground mb-1">
                    - {f}
                  </Text>
                ))}
                {!isCurrent && (
                  <Button
                    onPress={() => handleUpgrade(plan.id)}
                    loading={actionPlanId === plan.id}
                    variant={isUpgrade ? 'default' : 'outline'}
                    className="mt-3"
                  >
                    {actionLabel}
                  </Button>
                )}
              </Card>
            );
          })
        )}

        {/* Cancel button */}
        {!isLoading && current && current.plan !== 'free' && !isCancelPending && (
          <Button
            variant="destructive"
            onPress={handleCancel}
            loading={canceling}
            className="mb-6"
          >
            Cancelar Assinatura
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
