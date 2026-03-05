import { View, Text, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchBar } from '@/components/SearchBar';
import { ProfileCard } from '@/components/ProfileCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/api';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SearchStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<SearchStackParamList, 'SemanticSearch'>;

interface Profile {
  id: string;
  displayName: string;
  tagline?: string;
  city?: string;
  state?: string;
  averageRating?: number;
  reviewCount?: number;
  photos?: string[];
}

export function SemanticSearchScreen({ navigation }: Props) {
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api<Profile[]>('/search/semantic', { method: 'POST', body: { query } });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-foreground mb-4">Busca Inteligente</Text>
        <SearchBar placeholder="Descreva o que voce precisa..." onSearch={handleSearch} debounceMs={600} />
      </View>
      {loading ? (
        <View className="px-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 mb-3" />)}</View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-4"
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
              onPress={(id) => navigation.navigate('ProfileDetail', { id })}
            />
          )}
          ListEmptyComponent={<Text className="text-center text-muted-foreground mt-8">Use linguagem natural para buscar</Text>}
        />
      )}
    </SafeAreaView>
  );
}
