import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({
  password: z.string().min(8, 'Minimo 8 caracteres'),
  confirmPassword: z.string().min(8, 'Minimo 8 caracteres'),
}).refine((data) => data.password === data.confirmPassword, { message: 'Senhas nao conferem', path: ['confirmPassword'] });

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ route, navigation }: Props) {
  const { token } = route.params;
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: data.password }, noAuth: true });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View className="flex-1 justify-center items-center px-6 bg-background">
        <Text className="text-2xl font-bold text-foreground mb-4">Senha Redefinida!</Text>
        <Text className="text-muted-foreground text-center mb-6">Sua senha foi alterada com sucesso.</Text>
        <Button onPress={() => navigation.navigate('Login')}>Ir para Login</Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Nova Senha</Text>
        <Text className="text-muted-foreground mb-8">Defina sua nova senha</Text>
        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}
        <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
          <Input label="Nova Senha" placeholder="••••••••" secureTextEntry value={value} onChangeText={onChange} error={errors.password?.message} />
        )} />
        <Controller control={control} name="confirmPassword" render={({ field: { onChange, value } }) => (
          <Input label="Confirmar Senha" placeholder="••••••••" secureTextEntry value={value} onChangeText={onChange} error={errors.confirmPassword?.message} />
        )} />
        <Button onPress={handleSubmit(onSubmit)} loading={loading}>Redefinir Senha</Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
