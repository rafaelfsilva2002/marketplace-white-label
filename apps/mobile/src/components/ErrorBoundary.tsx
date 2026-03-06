import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Button } from './ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Text className="text-5xl mb-4">⚠️</Text>
          <Text className="text-xl font-semibold text-foreground text-center mb-2">
            Algo deu errado
          </Text>
          <Text className="text-sm text-muted-foreground text-center mb-6">
            Tente reiniciar o aplicativo
          </Text>
          <Button onPress={this.handleRetry}>Tentar novamente</Button>
        </View>
      );
    }

    return this.props.children;
  }
}
