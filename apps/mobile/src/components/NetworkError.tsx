import { View, Text } from 'react-native';
import { Button } from './ui/Button';

interface NetworkErrorProps {
  onRetry: () => void;
  message?: string;
}

export function NetworkError({
  onRetry,
  message = 'Sem conexao com a internet. Verifique sua rede e tente novamente.',
}: NetworkErrorProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-5xl mb-4">📡</Text>
      <Text className="text-lg font-semibold text-foreground text-center mb-2">
        Erro de conexao
      </Text>
      <Text className="text-sm text-muted-foreground text-center mb-6">
        {message}
      </Text>
      <Button variant="outline" onPress={onRetry}>Tentar novamente</Button>
    </View>
  );
}
