import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { StarRating } from './ui/StarRating';
import { Card } from './ui/Card';

interface ProfileCardProps {
  id: string;
  name: string;
  tagline?: string;
  city?: string;
  state?: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string | null;
  featured?: boolean;
  onPress: (id: string) => void;
}

export function ProfileCard({ id, name, tagline, city, state, rating, reviewCount, photoUrl, featured, onPress }: ProfileCardProps) {
  return (
    <TouchableOpacity onPress={() => onPress(id)} activeOpacity={0.7}>
      <Card className="mb-3">
        <View className="flex-row items-center">
          <Avatar uri={photoUrl} name={name} size={56} />
          <View className="ml-3 flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-foreground">{name}</Text>
              {featured && <Badge variant="warning">Destaque</Badge>}
            </View>
            {tagline && <Text className="text-sm text-muted-foreground mt-0.5" numberOfLines={1}>{tagline}</Text>}
            <View className="flex-row items-center mt-1 gap-2">
              {rating != null && (
                <View className="flex-row items-center gap-1">
                  <StarRating rating={rating} size={14} />
                  <Text className="text-xs text-muted-foreground">({reviewCount ?? 0})</Text>
                </View>
              )}
              {city && <Text className="text-xs text-muted-foreground">{city}{state ? `, ${state}` : ''}</Text>}
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}
