import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<DashboardStackParamList, 'EditProfile'>;

const schema = z.object({
  displayName: z.string().min(2),
  tagline: z.string().optional(),
  bio: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function EditProfileScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: profile, isLoading } = useApiQuery<any>(['profile', id], `/profiles/${id}`);
  const mutation = useApiMutation<FormData>(`/profiles/${id}`, 'PATCH', [['profile', id], ['my-profiles']]);

  const { control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (profile) reset({ displayName: profile.displayName, tagline: profile.tagline, bio: profile.bio, city: profile.city, state: profile.state });
  }, [profile, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      await mutation.mutateAsync(data);
      Alert.alert('Sucesso', 'Perfil atualizado!');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  if (isLoading) return <SafeAreaView className="flex-1 bg-background px-4 pt-4"><Skeleton className="h-96" /></SafeAreaView>;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-4 pt-4">
        <View className="flex-row items-center mb-4">
          <Button variant="ghost" onPress={() => navigation.goBack()}>← Voltar</Button>
          <Text className="text-xl font-bold text-foreground ml-2">Editar Perfil</Text>
        </View>
        <Controller control={control} name="displayName" render={({ field: { onChange, value } }) => (
          <Input label="Nome de Exibicao" value={value} onChangeText={onChange} error={errors.displayName?.message} />
        )} />
        <Controller control={control} name="tagline" render={({ field: { onChange, value } }) => (
          <Input label="Subtitulo" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="bio" render={({ field: { onChange, value } }) => (
          <Input label="Bio" value={value} onChangeText={onChange} multiline numberOfLines={4} className="h-24" />
        )} />
        <Controller control={control} name="city" render={({ field: { onChange, value } }) => (
          <Input label="Cidade" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="state" render={({ field: { onChange, value } }) => (
          <Input label="Estado" value={value} onChangeText={onChange} />
        )} />
        <Button onPress={handleSubmit(onSubmit)} loading={mutation.isPending} className="mt-4 mb-8">Salvar</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
