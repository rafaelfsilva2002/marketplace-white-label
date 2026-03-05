import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive';

interface ButtonProps {
  onPress: () => void;
  children: string;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

const variants: Record<Variant, { container: string; text: string }> = {
  default: { container: 'bg-primary-600 rounded-lg px-6 py-3', text: 'text-white font-semibold text-center' },
  outline: { container: 'border border-border rounded-lg px-6 py-3', text: 'text-foreground font-semibold text-center' },
  ghost: { container: 'px-6 py-3', text: 'text-primary-600 font-semibold text-center' },
  destructive: { container: 'bg-red-600 rounded-lg px-6 py-3', text: 'text-white font-semibold text-center' },
};

export function Button({ onPress, children, variant = 'default', disabled, loading, className = '' }: ButtonProps) {
  const v = variants[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`${v.container} ${disabled ? 'opacity-50' : ''} ${className}`}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'default' ? '#fff' : '#dc2626'} />
      ) : (
        <Text className={v.text}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}
