import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { ProfileCard } from '@/components/ProfileCard';
import { SearchBar } from '@/components/SearchBar';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

interface Profile {
  id: string;
  displayName: string;
  tagline?: string;
  city?: string;
  state?: string;
  averageRating?: number;
  reviewCount?: number;
  photos?: string[];
  isFeatured?: boolean;
}

export function HomeScreen({ navigation }: Props) {
  const { data: profiles, isLoading, refetch, isRefetching } = useApiQuery<Profile[]>(['profiles', 'featured'], '/profiles?limit=20');

  const handleSearch = (q: string) => {
    if (q.trim()) navigation.navigate('SearchResults', { q });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground mb-4">Marketplace FTM</Text>
        <SearchBar placeholder="Buscar profissionais..." onSearch={handleSearch} />
      </View>
      {isLoading ? (
        <View className="px-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 mb-3" />
          ))}
        </View>
      ) : (
        <FlatList
          data={profiles ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-4"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#dc2626" />}
          renderItem={({ item }) => (
            <ProfileCard
              id={item.id}
              name={item.displayName}
              tagline={item.tagline}
              city={item.city}
              state={item.state}
              rating={item.averageRating}
              reviewCount={item.reviewCount}
              photoUrl={item.photos?.[0]}
              featured={item.isFeatured}
              onPress={(id) => navigation.navigate('ProfileDetail', { id })}
            />
          )}
          ListEmptyComponent={<Text className="text-center text-muted-foreground mt-8">Nenhum profissional encontrado</Text>}
        />
      )}
    </SafeAreaView>
  );
}
