import { View, TouchableOpacity, Text } from 'react-native';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  onRate?: (rating: number) => void;
}

export function StarRating({ rating, maxStars = 5, size = 20, onRate }: StarRatingProps) {
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: maxStars }, (_, i) => {
        const filled = i < Math.round(rating);
        const star = (
          <Text key={i} style={{ fontSize: size, color: filled ? '#f59e0b' : '#d1d5db' }}>
            {filled ? '\u2605' : '\u2606'}
          </Text>
        );
        return onRate ? (
          <TouchableOpacity key={i} onPress={() => onRate(i + 1)}>{star}</TouchableOpacity>
        ) : star;
      })}
    </View>
  );
}
