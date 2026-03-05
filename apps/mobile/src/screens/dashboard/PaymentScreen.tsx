import { View, Text, ScrollView, RefreshControl, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  formatCurrency,
  generateIdempotencyKey,
} from '@/services/payments';
import { api } from '@/services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';
import type {
  WalletBalance,
  TransactionHistory,
  LedgerEntry,
} from '@/services/payments';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Payment'>;

function TransactionItem({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.type === 'credit';
  const sign = isCredit ? '+' : '-';
  const colorClass = isCredit ? 'text-green-600' : 'text-red-600';
  const date = new Date(entry.createdAt);
  const formattedDate = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
  const formattedTime = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View className="flex-row items-center justify-between py-3 border-b border-border">
      <View className="flex-1 mr-3">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {entry.description ?? (isCredit ? 'Credito' : 'Debito')}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {formattedDate} {formattedTime}
        </Text>
      </View>
      <View className="items-end">
        <Text className={`text-sm font-bold ${colorClass}`}>
          {sign} {formatCurrency(entry.amount)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Saldo: {formatCurrency(entry.balanceAfter)}
        </Text>
      </View>
    </View>
  );
}

export function PaymentScreen({ navigation }: Props) {
  const {
    data: wallet,
    isLoading: loadingWallet,
    refetch: refetchWallet,
    isRefetching: isRefetchingWallet,
  } = useApiQuery<WalletBalance>(['wallet'], '/payments/wallet');

  const {
    data: history,
    isLoading: loadingHistory,
    refetch: refetchHistory,
    isRefetching: isRefetchingHistory,
  } = useApiQuery<TransactionHistory>(
    ['transaction-history'],
    '/payments/history?limit=50&offset=0',
  );

  const [addFundsAmount, setAddFundsAmount] = useState('');
  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);

  const isRefreshing = isRefetchingWallet || isRefetchingHistory;

  const onRefresh = useCallback(() => {
    refetchWallet();
    refetchHistory();
  }, [refetchWallet, refetchHistory]);

  const handleAddFunds = async () => {
    const numericValue = parseFloat(addFundsAmount.replace(',', '.'));
    if (isNaN(numericValue) || numericValue <= 0) {
      Alert.alert('Erro', 'Informe um valor valido maior que zero.');
      return;
    }

    const amountInCents = Math.round(numericValue * 100);

    setIsAddingFunds(true);
    try {
      const result = await api<{
        paymentIntentId: string;
        clientSecret: string;
        status: string;
        amount: number;
        currency: string;
      }>('/payments/create-payment', {
        method: 'POST',
        body: {
          profileId: 'self',
          amount: amountInCents,
          description: 'Adicionar fundos a carteira',
          idempotencyKey: generateIdempotencyKey(),
        },
      });

      Alert.alert(
        'Pagamento Criado',
        `Intent criado com sucesso.\nID: ${result.paymentIntentId}\nValor: ${formatCurrency(result.amount)}\nStatus: ${result.status}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setAddFundsAmount('');
              setShowAddFunds(false);
              onRefresh();
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'Falha ao criar pagamento.');
    } finally {
      setIsAddingFunds(false);
    }
  };

  const entries = history?.entries ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#dc2626"
          />
        }
      >
        <View className="px-4 pt-4">
          {/* Header */}
          <View className="flex-row items-center mb-4">
            <Button variant="ghost" onPress={() => navigation.goBack()}>
              ← Voltar
            </Button>
            <Text className="text-xl font-bold text-foreground ml-2">
              Carteira
            </Text>
          </View>

          {/* Balance Card */}
          {loadingWallet ? (
            <Skeleton className="h-32 mb-4" />
          ) : (
            <Card className="mb-4 bg-primary-600">
              <Text className="text-sm text-white opacity-80">
                Saldo Disponivel
              </Text>
              <Text className="text-3xl font-bold text-white mt-1">
                {formatCurrency(wallet?.balance ?? 0, wallet?.currency)}
              </Text>
              {(wallet?.pendingBalance ?? 0) > 0 && (
                <View className="flex-row items-center mt-2">
                  <Text className="text-sm text-white opacity-80">
                    Pendente:{' '}
                  </Text>
                  <Text className="text-sm font-semibold text-white">
                    {formatCurrency(wallet?.pendingBalance ?? 0, wallet?.currency)}
                  </Text>
                </View>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-3 mb-4">
            <Button
              onPress={() => setShowAddFunds(!showAddFunds)}
              className="flex-1"
            >
              {showAddFunds ? 'Cancelar' : 'Adicionar Fundos'}
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                Alert.alert(
                  'Saque',
                  'Funcionalidade de saque disponivel pelo painel web. Configure sua conta Stripe Connect primeiro.',
                );
              }}
              className="flex-1"
            >
              Sacar
            </Button>
          </View>

          {/* Add Funds Form */}
          {showAddFunds && (
            <Card className="mb-4">
              <CardHeader>
                <Text className="text-base font-semibold text-foreground">
                  Adicionar Fundos
                </Text>
              </CardHeader>
              <CardContent>
                <Input
                  label="Valor (R$)"
                  placeholder="Ex: 50,00"
                  keyboardType="decimal-pad"
                  value={addFundsAmount}
                  onChangeText={setAddFundsAmount}
                />
                <Button
                  onPress={handleAddFunds}
                  loading={isAddingFunds}
                  disabled={!addFundsAmount.trim()}
                >
                  Confirmar Pagamento
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Transaction History */}
          <Card className="mb-6">
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground">
                  Historico de Transacoes
                </Text>
                {history && (
                  <Badge variant="outline">{String(history.total)} total</Badge>
                )}
              </View>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <View>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-14 mb-2" />
                  ))}
                </View>
              ) : entries.length === 0 ? (
                <Text className="text-muted-foreground text-center py-4">
                  Nenhuma transacao encontrada.
                </Text>
              ) : (
                entries.map((entry) => (
                  <TransactionItem key={entry.id} entry={entry} />
                ))
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
