import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/api';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Subscription'>;

const plans = [
  { id: 'free', name: 'Gratuito', price: 'R$ 0', features: ['Perfil basico', '5 fotos', 'Busca padrao'] },
  { id: 'pro', name: 'Profissional', price: 'R$ 49/mes', features: ['Perfil destaque', '20 fotos', 'Busca semantica', 'Analytics'] },
  { id: 'premium', name: 'Premium', price: 'R$ 99/mes', features: ['Tudo do Pro', 'Fotos ilimitadas', 'Prioridade na busca', 'Suporte dedicado'] },
];

export function SubscriptionScreen({ navigation }: Props) {
  const { data: current, isLoading } = useApiQuery<any>(['subscription'], '/subscriptions/current');
  const [upgrading, setUpgrading] = useState('');

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      await api('/subscriptions/upgrade', { method: 'POST', body: { planId } });
      Alert.alert('Sucesso', 'Plano atualizado!');
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setUpgrading('');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
          <Text className="text-xl font-bold text-foreground ml-2">Assinatura</Text>
        </View>

        {isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          plans.map((plan) => {
            const isCurrent = current?.planId === plan.id;
            return (
              <Card key={plan.id} className={`mb-3 ${isCurrent ? 'border-primary-500 border-2' : ''}`}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-lg font-bold text-foreground">{plan.name}</Text>
                  {isCurrent && <Badge variant="success">Atual</Badge>}
                </View>
                <Text className="text-xl font-bold text-primary-600 mb-2">{plan.price}</Text>
                {plan.features.map((f, i) => (
                  <Text key={i} className="text-sm text-foreground mb-1">• {f}</Text>
                ))}
                {!isCurrent && (
                  <Button onPress={() => handleUpgrade(plan.id)} loading={upgrading === plan.id} className="mt-3">
                    {plan.id === 'free' ? 'Downgrade' : 'Upgrade'}
                  </Button>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
