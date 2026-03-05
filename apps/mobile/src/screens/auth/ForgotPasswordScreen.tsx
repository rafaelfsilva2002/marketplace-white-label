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

const schema = z.object({ email: z.string().email('Email invalido') });
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: data, noAuth: true });
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View className="flex-1 justify-center items-center px-6 bg-background">
        <Text className="text-2xl font-bold text-foreground mb-4">Email Enviado!</Text>
        <Text className="text-muted-foreground text-center mb-6">Verifique sua caixa de entrada para redefinir a senha.</Text>
        <Button onPress={() => navigation.navigate('Login')}>Voltar ao Login</Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Recuperar Senha</Text>
        <Text className="text-muted-foreground mb-8">Informe seu email</Text>
        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}
        <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
          <Input label="Email" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" value={value} onChangeText={onChange} error={errors.email?.message} />
        )} />
        <Button onPress={handleSubmit(onSubmit)} loading={loading}>Enviar</Button>
        <Button variant="ghost" onPress={() => navigation.goBack()} className="mt-4">Voltar</Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
