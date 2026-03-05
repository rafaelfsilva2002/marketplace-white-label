import { View, Text, FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/api';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '@/navigation/AdminStack';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminModeration'>;

interface ModerationItem {
  id: string;
  entityType: string;
  entityId: string;
  reason?: string;
  status: string;
  createdAt: string;
}

export function AdminModerationScreen({ navigation }: Props) {
  const { data: items, isLoading, refetch, isRefetching } = useApiQuery<ModerationItem[]>(['moderation-queue'], '/moderation/queue');
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessing(id);
    try {
      await api(`/moderation/queue/${id}/${action}`, { method: 'POST' });
      refetch();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
          <Text className="text-xl font-bold text-foreground ml-2">Moderacao</Text>
        </View>
      </View>
      {isLoading ? (
        <View className="px-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24 mb-3" />)}</View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-4"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#dc2626" />}
          renderItem={({ item }) => (
            <Card className="mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <Badge>{item.entityType}</Badge>
                <Badge variant={item.status === 'pending' ? 'warning' : 'outline'}>{item.status}</Badge>
              </View>
              {item.reason && <Text className="text-sm text-foreground mb-2">{item.reason}</Text>}
              {item.status === 'pending' && (
                <View className="flex-row gap-2">
                  <Button onPress={() => handleAction(item.id, 'approve')} loading={processing === item.id} className="flex-1">Aprovar</Button>
                  <Button variant="destructive" onPress={() => handleAction(item.id, 'reject')} loading={processing === item.id} className="flex-1">Rejeitar</Button>
                </View>
              )}
            </Card>
          )}
          ListEmptyComponent={<Text className="text-center text-muted-foreground mt-8">Fila vazia</Text>}
        />
      )}
    </SafeAreaView>
  );
}
