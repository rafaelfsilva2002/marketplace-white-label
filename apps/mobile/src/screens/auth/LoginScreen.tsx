import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
});
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await login(data.email, data.password);
    } catch (e: any) {
      setError(e.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Entrar</Text>
        <Text className="text-muted-foreground mb-8">Acesse sua conta</Text>
        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}
        <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
          <Input label="Email" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" value={value} onChangeText={onChange} error={errors.email?.message} />
        )} />
        <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
          <Input label="Senha" placeholder="••••••••" secureTextEntry value={value} onChangeText={onChange} error={errors.password?.message} />
        )} />
        <Button onPress={handleSubmit(onSubmit)} loading={loading}>Entrar</Button>
        <View className="flex-row justify-between mt-4">
          <Button variant="ghost" onPress={() => navigation.navigate('ForgotPassword')}>Esqueci a senha</Button>
          <Button variant="ghost" onPress={() => navigation.navigate('Register')}>Criar conta</Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
