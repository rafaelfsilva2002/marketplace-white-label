import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '@/navigation/MainTabs';

type Props = NativeStackScreenProps<ChatStackParamList, 'Chat'>;

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'system';
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface MessagesResponse {
  data: Message[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <View className={`mb-2 max-w-[80%] ${isOwn ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-4 py-2.5 ${
          isOwn ? 'bg-primary-600 rounded-br-sm' : 'bg-white border border-border rounded-bl-sm'
        }`}
      >
        <Text className={`text-sm ${isOwn ? 'text-white' : 'text-foreground'}`}>
          {message.content}
        </Text>
      </View>
      <Text
        className={`text-[10px] mt-0.5 ${isOwn ? 'text-right text-muted-foreground' : 'text-muted-foreground'}`}
      >
        {formatMessageTime(message.createdAt)}
        {isOwn && (
          message.isRead ? ' \u2713\u2713' : ' \u2713'
        )}
      </Text>
    </View>
  );
}

export function ChatScreen({ route, navigation }: Props) {
  const { conversationId, participantName } = route.params;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const [inputText, setInputText] = useState('');

  const messagesQueryKey = ['messages', conversationId];

  const {
    data: messagesData,
    isLoading,
  } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: () => api<MessagesResponse>(`/chat/conversations/${conversationId}/messages?limit=50`),
    staleTime: 5_000,
    refetchInterval: 3_000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api<Message>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { content, type: 'text' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Mark messages as read when entering the conversation
  useEffect(() => {
    api(`/chat/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {
      // Silently ignore mark-as-read errors
    });

    return () => {
      // Also mark as read when leaving
      api(`/chat/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
    };
  }, [conversationId, queryClient]);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || sendMutation.isPending) return;

    setInputText('');
    sendMutation.mutate(trimmed);
  }, [inputText, sendMutation]);

  const messagesList = messagesData?.data ?? [];

  // Reverse the list for inverted FlatList (newest first)
  const invertedMessages = [...messagesList].reverse();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border bg-white">
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} className="mr-3">
          <Text className="text-primary-600 text-base font-semibold">{'\u2190'} Voltar</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground flex-1" numberOfLines={1}>
          {participantName}
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {isLoading ? (
          <View className="flex-1 px-4 pt-4">
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} className={`mb-3 ${i % 2 === 0 ? 'self-start' : 'self-end'}`}>
                <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-48' : 'w-40'}`} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={invertedMessages}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.senderId === user?.id} />
            )}
            ListEmptyComponent={
              <View className="flex-1 justify-center items-center py-20">
                <Text className="text-muted-foreground text-center">
                  Nenhuma mensagem ainda.{'\n'}Envie a primeira!
                </Text>
              </View>
            }
          />
        )}

        {/* Input */}
        <View className="flex-row items-end px-4 py-2 border-t border-border bg-white">
          <TextInput
            className="flex-1 bg-background rounded-2xl px-4 py-2.5 text-sm text-foreground border border-border mr-2 max-h-24"
            placeholder="Digite uma mensagem..."
            placeholderTextColor="#a3a3a3"
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || sendMutation.isPending}
            activeOpacity={0.7}
            className={`rounded-full w-10 h-10 items-center justify-center mb-0.5 ${
              inputText.trim() ? 'bg-primary-600' : 'bg-muted'
            }`}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-lg font-bold">{'\u2191'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
