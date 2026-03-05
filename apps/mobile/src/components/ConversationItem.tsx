import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from './ui/Avatar';

interface ConversationItemProps {
  id: string;
  participantName: string;
  participantAvatar?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  onPress: (id: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ConversationItem({
  id,
  participantName,
  participantAvatar,
  lastMessage,
  lastMessageAt,
  unreadCount,
  onPress,
}: ConversationItemProps) {
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      className={`flex-row items-center px-4 py-3 border-b border-border ${hasUnread ? 'bg-primary-50' : 'bg-white'}`}
    >
      <Avatar uri={participantAvatar} name={participantName} size={48} />

      <View className="flex-1 ml-3">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-base ${hasUnread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}
            numberOfLines={1}
          >
            {participantName}
          </Text>
          {lastMessageAt && (
            <Text className="text-xs text-muted-foreground ml-2">
              {formatRelativeTime(lastMessageAt)}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-0.5">
          <Text
            className={`text-sm flex-1 mr-2 ${hasUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
            numberOfLines={1}
          >
            {lastMessage || 'Nenhuma mensagem ainda'}
          </Text>
          {hasUnread && (
            <View className="bg-primary-600 rounded-full min-w-[20px] h-5 items-center justify-center px-1.5">
              <Text className="text-white text-xs font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
