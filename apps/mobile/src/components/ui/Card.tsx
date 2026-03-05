import { View, type ViewProps } from 'react-native';

export function Card({ children, className = '', ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`bg-white rounded-xl border border-border p-4 ${className}`} {...props}>
      {children}
    </View>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`mb-3 ${className}`}>{children}</View>;
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={className}>{children}</View>;
}
