import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label && <Text className="text-sm font-medium text-foreground mb-1">{label}</Text>}
      <TextInput
        className={`border rounded-lg px-4 py-3 text-base text-foreground ${error ? 'border-red-500' : 'border-border'} ${className}`}
        placeholderTextColor="#737373"
        {...props}
      />
      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
