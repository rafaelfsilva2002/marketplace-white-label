import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useApiQuery } from '@/hooks/useApi';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Dashboard'>;

interface Profile {
  id: string;
  displayName: string;
  totalViews?: number;
  averageRating?: number;
  reviewCount?: number;
  status?: string;
}

export function DashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: profiles, isLoading, refetch, isRefetching } = useApiQuery<Profile[]>(['my-profiles'], `/profiles?userId=${user?.id}`);
  const profile = profiles?.[0];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4" refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#dc2626" />}>
        <Text className="text-2xl font-bold text-foreground mb-4">Painel</Text>
        {isLoading ? (
          <View>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 mb-3" />)}</View>
        ) : profile ? (
          <>
            <View className="flex-row gap-3 mb-4">
              <Card className="flex-1">
                <Text className="text-xs text-muted-foreground">Visualizacoes</Text>
                <Text className="text-2xl font-bold text-foreground">{profile.totalViews ?? 0}</Text>
              </Card>
              <Card className="flex-1">
                <Text className="text-xs text-muted-foreground">Nota</Text>
                <View className="flex-row items-center gap-1">
                  <StarRating rating={profile.averageRating ?? 0} size={16} />
                </View>
              </Card>
              <Card className="flex-1">
                <Text className="text-xs text-muted-foreground">Reviews</Text>
                <Text className="text-2xl font-bold text-foreground">{profile.reviewCount ?? 0}</Text>
              </Card>
            </View>

            <Card className="mb-3">
              <CardHeader>
                <Text className="text-base font-semibold text-foreground">Acoes Rapidas</Text>
              </CardHeader>
              <CardContent>
                <Button onPress={() => navigation.navigate('EditProfile', { id: profile.id })} className="mb-2">Editar Perfil</Button>
                <Button variant="outline" onPress={() => navigation.navigate('MyReviews', { profileId: profile.id })} className="mb-2">Ver Avaliacoes</Button>
                <Button variant="outline" onPress={() => navigation.navigate('Subscription')}>Minha Assinatura</Button>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <Text className="text-muted-foreground text-center">Voce ainda nao tem um perfil profissional.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
