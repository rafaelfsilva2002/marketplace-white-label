import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { ReviewItem } from '@/components/ReviewItem';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'MyReviews'>;

interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  sentiment?: string;
  reviewer?: { name: string };
}

export function MyReviewsScreen({ route, navigation }: Props) {
  const { profileId } = route.params;
  const { data: reviews, isLoading, refetch, isRefetching } = useApiQuery<Review[]>(['reviews', profileId], `/reviews/profile/${profileId}`);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
          <Text className="text-xl font-bold text-foreground ml-2">Minhas Avaliacoes</Text>
        </View>
      </View>
      {isLoading ? (
        <View className="px-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 mb-2" />)}</View>
      ) : (
        <FlatList
          data={reviews ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-4"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#dc2626" />}
          renderItem={({ item }) => (
            <ReviewItem reviewerName={item.reviewer?.name ?? 'Anonimo'} rating={item.rating} comment={item.comment} createdAt={item.createdAt} sentiment={item.sentiment} />
          )}
          ListEmptyComponent={<Text className="text-center text-muted-foreground mt-8">Nenhuma avaliacao ainda</Text>}
        />
      )}
    </SafeAreaView>
  );
}
