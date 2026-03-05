import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminStackParamList } from '@/navigation/AdminStack';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminStats'>;

interface Stats {
  totalUsers?: number;
  totalProfiles?: number;
  pendingModeration?: number;
  totalRevenue?: number;
  activeSubscriptions?: number;
}

export function AdminStatsScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const { data: stats, isLoading, refetch, isRefetching } = useApiQuery<Stats>(['admin-stats'], '/admin/stats');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4" refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#dc2626" />}>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-foreground">Admin</Text>
          <Button variant="ghost" onPress={logout}>Sair</Button>
        </View>

        {isLoading ? (
          <View>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 mb-3" />)}</View>
        ) : (
          <>
            <View className="flex-row gap-3 mb-3">
              <Card className="flex-1"><Text className="text-xs text-muted-foreground">Usuarios</Text><Text className="text-2xl font-bold">{stats?.totalUsers ?? 0}</Text></Card>
              <Card className="flex-1"><Text className="text-xs text-muted-foreground">Perfis</Text><Text className="text-2xl font-bold">{stats?.totalProfiles ?? 0}</Text></Card>
            </View>
            <View className="flex-row gap-3 mb-3">
              <Card className="flex-1"><Text className="text-xs text-muted-foreground">Moderacao</Text><Text className="text-2xl font-bold">{stats?.pendingModeration ?? 0}</Text></Card>
              <Card className="flex-1"><Text className="text-xs text-muted-foreground">Assinaturas</Text><Text className="text-2xl font-bold">{stats?.activeSubscriptions ?? 0}</Text></Card>
            </View>
            <Button onPress={() => navigation.navigate('AdminModeration')} className="mt-4">Fila de Moderacao</Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
