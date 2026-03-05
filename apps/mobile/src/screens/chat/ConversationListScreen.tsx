import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { ConversationItem } from '@/components/ConversationItem';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<ChatStackParamList, 'ConversationList'>;

interface OtherParticipant {
  id: string;
  name: string | null;
  email: string;
}

interface Conversation {
  id: string;
  participantOneId: string;
  participantTwoId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  otherParticipant: OtherParticipant | null;
  unreadCount: number;
}

interface ConversationsResponse {
  data: Conversation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function ConversationListScreen({ navigation }: Props) {
  const { isAuthenticated } = useAuth();

  const {
    data: conversations,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<ConversationsResponse>('/chat/conversations'),
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 10_000,
  });

  const handleConversationPress = (conversationId: string) => {
    const conversation = conversations?.data.find((c) => c.id === conversationId);
    const participantName = conversation?.otherParticipant?.name ?? 'Chat';

    navigation.navigate('Chat', { conversationId, participantName });
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-foreground">Mensagens</Text>
        </View>
        <View className="px-4">
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} className="flex-row items-center py-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <View className="flex-1 ml-3">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-48" />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center px-4">
        <Text className="text-lg text-muted-foreground text-center">
          Faca login para ver suas mensagens
        </Text>
      </SafeAreaView>
    );
  }

  const conversationList = conversations?.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-4 pt-4 pb-2 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Mensagens</Text>
      </View>

      <FlatList
        data={conversationList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            id={item.id}
            participantName={item.otherParticipant?.name ?? 'Usuario'}
            participantAvatar={null}
            lastMessage={item.lastMessagePreview}
            lastMessageAt={item.lastMessageAt}
            unreadCount={item.unreadCount}
            onPress={handleConversationPress}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#dc2626"
          />
        }
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center py-20">
            <Text className="text-lg text-muted-foreground text-center">
              Nenhuma conversa ainda
            </Text>
            <Text className="text-sm text-muted-foreground text-center mt-1">
              Inicie uma conversa a partir do perfil de um profissional
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
