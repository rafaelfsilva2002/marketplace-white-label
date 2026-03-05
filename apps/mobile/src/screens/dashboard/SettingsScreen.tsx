import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { api } from '@/services/api';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Senhas nao conferem', path: ['confirmPassword'] });

type PasswordFormData = z.infer<typeof passwordSchema>;

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const { control, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

  const onChangePassword = async (data: PasswordFormData) => {
    setChangingPassword(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
      Alert.alert('Sucesso', 'Senha alterada!');
      reset();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert('Deletar Conta', 'Tem certeza? Esta acao e irreversivel.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Deletar', style: 'destructive', onPress: async () => {
        try {
          await api('/auth/me', { method: 'DELETE' });
          await logout();
        } catch (e: any) {
          Alert.alert('Erro', e.message);
        }
      }},
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4">
        <Text className="text-2xl font-bold text-foreground mb-4">Configuracoes</Text>

        <Card className="mb-4">
          <Text className="text-base font-semibold text-foreground mb-2">Conta</Text>
          <Text className="text-sm text-muted-foreground">Email: {user?.email}</Text>
          <Text className="text-sm text-muted-foreground">Nome: {user?.name}</Text>
          <Text className="text-sm text-muted-foreground">Role: {user?.role}</Text>
        </Card>

        <Card className="mb-4">
          <Text className="text-base font-semibold text-foreground mb-3">Alterar Senha</Text>
          <Controller control={control} name="currentPassword" render={({ field: { onChange, value } }) => (
            <Input label="Senha Atual" secureTextEntry value={value} onChangeText={onChange} error={errors.currentPassword?.message} />
          )} />
          <Controller control={control} name="newPassword" render={({ field: { onChange, value } }) => (
            <Input label="Nova Senha" secureTextEntry value={value} onChangeText={onChange} error={errors.newPassword?.message} />
          )} />
          <Controller control={control} name="confirmPassword" render={({ field: { onChange, value } }) => (
            <Input label="Confirmar Nova Senha" secureTextEntry value={value} onChangeText={onChange} error={errors.confirmPassword?.message} />
          )} />
          <Button onPress={handleSubmit(onChangePassword)} loading={changingPassword}>Alterar Senha</Button>
        </Card>

        <Button variant="outline" onPress={logout} className="mb-3">Sair da Conta</Button>
        <Button variant="destructive" onPress={handleDeleteAccount} className="mb-8">Deletar Conta</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
