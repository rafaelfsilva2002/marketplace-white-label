import { View, Text } from 'react-native';
import { Avatar } from './ui/Avatar';
import { StarRating } from './ui/StarRating';
import { Badge } from './ui/Badge';
import { formatRelativeTime } from '@/lib/utils';

interface ReviewItemProps {
  reviewerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  sentiment?: string | null;
}

export function ReviewItem({ reviewerName, rating, comment, createdAt, sentiment }: ReviewItemProps) {
  const sentimentVariant = sentiment === 'positive' ? 'success' : sentiment === 'negative' ? 'destructive' : 'outline';

  return (
    <View className="py-3 border-b border-border">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center gap-2">
          <Avatar name={reviewerName} size={32} />
          <Text className="font-medium text-foreground">{reviewerName}</Text>
        </View>
        <Text className="text-xs text-muted-foreground">{formatRelativeTime(createdAt)}</Text>
      </View>
      <View className="flex-row items-center gap-2 mb-1">
        <StarRating rating={rating} size={14} />
        {sentiment && <Badge variant={sentimentVariant}>{sentiment}</Badge>}
      </View>
      <Text className="text-sm text-foreground">{comment}</Text>
    </View>
  );
}
