import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApiQuery } from '@/hooks/useApi';
import { api } from '@/services/api';
import {
  formatCurrency,
  generateIdempotencyKey,
} from '@/services/payments';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';
import type { PaymentResult } from '@/services/payments';

type Props = NativeStackScreenProps<HomeStackParamList, 'BookingPayment'>;

interface ProfileSummary {
  id: string;
  displayName: string;
  city?: string;
  state?: string;
  averageRating?: number;
}

type PaymentState =
  | { step: 'review' }
  | { step: 'processing' }
  | { step: 'success'; result: PaymentResult }
  | { step: 'error'; message: string };

export function BookingPaymentScreen({ route, navigation }: Props) {
  const { profileId, amount } = route.params;

  const { data: profile, isLoading: loadingProfile } =
    useApiQuery<ProfileSummary>(
      ['profile-summary', profileId],
      `/profiles/${profileId}`,
    );

  const [paymentState, setPaymentState] = useState<PaymentState>({
    step: 'review',
  });

  const handlePayment = async () => {
    setPaymentState({ step: 'processing' });

    try {
      const result = await api<PaymentResult>('/payments/create-payment', {
        method: 'POST',
        body: {
          profileId,
          amount,
          description: `Pagamento para ${profile?.displayName ?? 'profissional'}`,
          idempotencyKey: generateIdempotencyKey(),
        },
      });

      setPaymentState({ step: 'success', result });
    } catch (e: any) {
      setPaymentState({
        step: 'error',
        message: e.message ?? 'Falha ao processar pagamento.',
      });
    }
  };

  const handleConfirmPayment = async (paymentIntentId: string) => {
    try {
      const result = await api<{ status: string }>('/payments/confirm', {
        method: 'POST',
        body: { paymentIntentId },
      });

      Alert.alert(
        'Confirmado',
        `Status do pagamento: ${result.status}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'Falha ao confirmar pagamento.');
    }
  };

  const platformFee = Math.round(amount * 0.1);
  const professionalReceives = amount - platformFee;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4">
        {/* Header */}
        <View className="flex-row items-center mb-4">
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            disabled={paymentState.step === 'processing'}
          >
            ← Voltar
          </Button>
          <Text className="text-xl font-bold text-foreground ml-2">
            Pagamento
          </Text>
        </View>

        {/* Professional Info */}
        {loadingProfile ? (
          <Skeleton className="h-20 mb-4" />
        ) : profile ? (
          <Card className="mb-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-bold text-foreground">
                  {profile.displayName}
                </Text>
                {profile.city && (
                  <Text className="text-sm text-muted-foreground">
                    {profile.city}
                    {profile.state ? `, ${profile.state}` : ''}
                  </Text>
                )}
              </View>
              {profile.averageRating != null && (
                <Badge variant="success">
                  {profile.averageRating.toFixed(1)} estrelas
                </Badge>
              )}
            </View>
          </Card>
        ) : (
          <Card className="mb-4">
            <Text className="text-muted-foreground">
              Profissional ID: {profileId}
            </Text>
          </Card>
        )}

        {/* Payment Review */}
        {paymentState.step === 'review' && (
          <>
            <Card className="mb-4">
              <CardHeader>
                <Text className="text-base font-semibold text-foreground">
                  Resumo do Pagamento
                </Text>
              </CardHeader>
              <CardContent>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-muted-foreground">
                    Valor do servico
                  </Text>
                  <Text className="text-sm font-medium text-foreground">
                    {formatCurrency(amount)}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-muted-foreground">
                    Taxa da plataforma (10%)
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {formatCurrency(platformFee)}
                  </Text>
                </View>
                <View className="border-t border-border mt-2 pt-2">
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-muted-foreground">
                      Profissional recebe
                    </Text>
                    <Text className="text-sm font-medium text-foreground">
                      {formatCurrency(professionalReceives)}
                    </Text>
                  </View>
                </View>
                <View className="border-t border-border mt-2 pt-2">
                  <View className="flex-row justify-between">
                    <Text className="text-base font-bold text-foreground">
                      Total a pagar
                    </Text>
                    <Text className="text-base font-bold text-primary-600">
                      {formatCurrency(amount)}
                    </Text>
                  </View>
                </View>
              </CardContent>
            </Card>

            <Button onPress={handlePayment} className="mb-4">
              Pagar {formatCurrency(amount)}
            </Button>

            <Text className="text-xs text-muted-foreground text-center mb-6">
              Ao confirmar, voce autoriza a cobranca via Stripe. O pagamento e
              processado de forma segura.
            </Text>
          </>
        )}

        {/* Processing */}
        {paymentState.step === 'processing' && (
          <Card className="mb-4">
            <View className="items-center py-8">
              <Text className="text-lg font-semibold text-foreground mb-2">
                Processando pagamento...
              </Text>
              <Text className="text-sm text-muted-foreground text-center">
                Aguarde enquanto criamos a intencao de pagamento.
              </Text>
              <View className="mt-4">
                <Button loading onPress={() => {}}>
                  Processando...
                </Button>
              </View>
            </View>
          </Card>
        )}

        {/* Success */}
        {paymentState.step === 'success' && (
          <>
            <Card className="mb-4 border-green-500 border-2">
              <View className="items-center py-4">
                <Text className="text-4xl mb-2">OK</Text>
                <Text className="text-lg font-bold text-green-600 mb-1">
                  Pagamento Criado
                </Text>
                <Text className="text-sm text-muted-foreground text-center mb-3">
                  A intencao de pagamento foi criada com sucesso.
                </Text>

                <View className="w-full">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs text-muted-foreground">ID</Text>
                    <Text className="text-xs text-foreground" numberOfLines={1}>
                      {paymentState.result.paymentIntentId}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs text-muted-foreground">Valor</Text>
                    <Text className="text-xs font-medium text-foreground">
                      {formatCurrency(
                        paymentState.result.amount,
                        paymentState.result.currency,
                      )}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs text-muted-foreground">Status</Text>
                    <Badge
                      variant={
                        paymentState.result.status === 'succeeded'
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {paymentState.result.status}
                    </Badge>
                  </View>
                </View>
              </View>
            </Card>

            {paymentState.result.status !== 'succeeded' && (
              <Button
                onPress={() =>
                  handleConfirmPayment(paymentState.result.paymentIntentId)
                }
                className="mb-3"
              >
                Confirmar Pagamento
              </Button>
            )}

            <Button variant="outline" onPress={() => navigation.goBack()}>
              Voltar ao Perfil
            </Button>
          </>
        )}

        {/* Error */}
        {paymentState.step === 'error' && (
          <>
            <Card className="mb-4 border-red-500 border-2">
              <View className="items-center py-4">
                <Text className="text-4xl mb-2">X</Text>
                <Text className="text-lg font-bold text-red-600 mb-1">
                  Erro no Pagamento
                </Text>
                <Text className="text-sm text-muted-foreground text-center">
                  {paymentState.message}
                </Text>
              </View>
            </Card>

            <Button
              onPress={() => setPaymentState({ step: 'review' })}
              className="mb-3"
            >
              Tentar Novamente
            </Button>
            <Button variant="outline" onPress={() => navigation.goBack()}>
              Cancelar
            </Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
