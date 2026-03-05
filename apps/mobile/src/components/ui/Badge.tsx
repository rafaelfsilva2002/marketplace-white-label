import { View, Text } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline';

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'bg-primary-100', text: 'text-primary-700' },
  success: { bg: 'bg-green-100', text: 'text-green-700' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  destructive: { bg: 'bg-red-100', text: 'text-red-700' },
  outline: { bg: 'bg-transparent border border-border', text: 'text-foreground' },
};

export function Badge({ children, variant = 'default' }: { children: string; variant?: BadgeVariant }) {
  const v = variantStyles[variant];
  return (
    <View className={`rounded-full px-3 py-1 self-start ${v.bg}`}>
      <Text className={`text-xs font-medium ${v.text}`}>{children}</Text>
    </View>
  );
}
