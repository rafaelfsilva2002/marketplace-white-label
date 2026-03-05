import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { ProfileCard } from '@/components/ProfileCard';
import { SearchBar } from '@/components/SearchBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<HomeStackParamList, 'SearchResults'>;

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

export function SearchResultsScreen({ route, navigation }: Props) {
  const [query, setQuery] = useState(route.params?.q || '');
  const { data: results, isLoading, refetch, isRefetching } = useApiQuery<Profile[]>(
    ['search', query],
    `/search?q=${encodeURIComponent(query)}`,
    { enabled: query.length > 0 },
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center gap-2 mb-3">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
        </View>
        <SearchBar placeholder="Buscar..." onSearch={setQuery} />
      </View>
      {isLoading ? (
        <View className="px-4">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 mb-3" />)}
        </View>
      ) : (
        <FlatList
          data={results ?? []}
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
          ListEmptyComponent={<Text className="text-center text-muted-foreground mt-8">{query ? 'Nenhum resultado' : 'Digite para buscar'}</Text>}
        />
      )}
    </SafeAreaView>
  );
}
