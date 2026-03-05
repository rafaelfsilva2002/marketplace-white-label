import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import { UserRole } from '@marketplace/shared';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const schema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'Minimo 8 caracteres'),
});
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>(UserRole.User);
  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    setLoading(true);
    try {
      await register({ ...data, role });
    } catch (e: any) {
      setError(e.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6 bg-background">
        <Text className="text-3xl font-bold text-foreground mb-2">Criar Conta</Text>
        <Text className="text-muted-foreground mb-8">Preencha seus dados</Text>
        {error ? <Text className="text-red-500 mb-4">{error}</Text> : null}
        <Controller control={control} name="name" render={({ field: { onChange, value } }) => (
          <Input label="Nome" placeholder="Seu nome" value={value} onChangeText={onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
          <Input label="Email" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" value={value} onChangeText={onChange} error={errors.email?.message} />
        )} />
        <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
          <Input label="Senha" placeholder="••••••••" secureTextEntry value={value} onChangeText={onChange} error={errors.password?.message} />
        )} />
        <View className="flex-row gap-3 mb-6">
          <Button variant={role === UserRole.User ? 'default' : 'outline'} onPress={() => setRole(UserRole.User)}>Cliente</Button>
          <Button variant={role === UserRole.Professional ? 'default' : 'outline'} onPress={() => setRole(UserRole.Professional)}>Profissional</Button>
        </View>
        <Button onPress={handleSubmit(onSubmit)} loading={loading}>Criar Conta</Button>
        <Button variant="ghost" onPress={() => navigation.goBack()} className="mt-4">Ja tenho conta</Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
