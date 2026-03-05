import { View, Text, ScrollView, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiQuery } from '@/hooks/useApi';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { StarRating } from '@/components/ui/StarRating';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReviewItem } from '@/components/ReviewItem';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<HomeStackParamList, 'ProfileDetail'>;

interface Profile {
  id: string;
  displayName: string;
  bio?: string;
  tagline?: string;
  city?: string;
  state?: string;
  services?: string[];
  averageRating?: number;
  reviewCount?: number;
  totalViews?: number;
  photos?: string[];
  isVerified?: boolean;
  status?: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  sentiment?: string;
  reviewer?: { name: string };
}

export function ProfileDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: profile, isLoading: loadingProfile, refetch, isRefetching } = useApiQuery<Profile>(['profile', id], `/profiles/${id}`);
  const { data: reviews, isLoading: loadingReviews } = useApiQuery<Review[]>(['reviews', id], `/reviews/profile/${id}`);

  if (loadingProfile) {
    return (
      <SafeAreaView className="flex-1 bg-background px-4 pt-4">
        <Skeleton className="h-48 mb-4" />
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-24" />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <Text className="text-lg text-muted-foreground">Perfil nao encontrado</Text>
        <Button variant="ghost" onPress={() => navigation.goBack()} className="mt-4">Voltar</Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#dc2626" />}>
        <View className="px-4 pt-2">
          <Button variant="ghost" onPress={() => navigation.goBack()} className="self-start mb-2">← Voltar</Button>
        </View>

        {profile.photos && profile.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {profile.photos.map((uri, i) => (
              <Image key={i} source={{ uri }} style={{ width: 280, height: 200, borderRadius: 12, marginLeft: i === 0 ? 16 : 8 }} />
            ))}
          </ScrollView>
        )}

        <View className="px-4">
          <View className="flex-row items-center gap-2 mb-1">
            <Avatar uri={profile.photos?.[0]} name={profile.displayName} size={64} />
            <View className="flex-1 ml-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-xl font-bold text-foreground">{profile.displayName}</Text>
                {profile.isVerified && <Badge variant="success">Verificado</Badge>}
              </View>
              {profile.tagline && <Text className="text-muted-foreground">{profile.tagline}</Text>}
              {profile.city && <Text className="text-sm text-muted-foreground">{profile.city}{profile.state ? `, ${profile.state}` : ''}</Text>}
            </View>
          </View>

          {profile.averageRating != null && (
            <View className="flex-row items-center gap-2 mt-2">
              <StarRating rating={profile.averageRating} />
              <Text className="text-sm text-muted-foreground">({profile.reviewCount ?? 0} avaliacoes)</Text>
            </View>
          )}

          {profile.bio && (
            <Card className="mt-4">
              <Text className="text-sm font-medium text-foreground mb-1">Sobre</Text>
              <Text className="text-sm text-foreground">{profile.bio}</Text>
            </Card>
          )}

          {profile.services && profile.services.length > 0 && (
            <Card className="mt-3">
              <Text className="text-sm font-medium text-foreground mb-2">Servicos</Text>
              <View className="flex-row flex-wrap gap-2">
                {profile.services.map((s, i) => <Badge key={i}>{s}</Badge>)}
              </View>
            </Card>
          )}

          <View className="mt-4 mb-6">
            <Text className="text-lg font-semibold text-foreground mb-2">Avaliacoes</Text>
            {loadingReviews ? (
              <View>{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 mb-2" />)}</View>
            ) : reviews && reviews.length > 0 ? (
              reviews.map((r) => (
                <ReviewItem key={r.id} reviewerName={r.reviewer?.name ?? 'Anonimo'} rating={r.rating} comment={r.comment} createdAt={r.createdAt} sentiment={r.sentiment} />
              ))
            ) : (
              <Text className="text-muted-foreground">Nenhuma avaliacao ainda</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
