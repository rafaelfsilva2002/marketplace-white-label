'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface ConversationItem {
  id: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  otherParticipant: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  unreadCount: number;
}

interface ConversationListProps {
  conversations: ConversationItem[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  loading?: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Carregando conversas...</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-muted-foreground text-center">
          Nenhuma conversa ainda. Inicie uma conversa a partir do perfil de um profissional.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col">
        {conversations.map((conv) => {
          const displayName =
            conv.otherParticipant?.name ||
            conv.otherParticipant?.email ||
            'Usuario';

          const time = conv.lastMessageAt
            ? formatRelativeTime(new Date(conv.lastMessageAt))
            : '';

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'flex items-start gap-3 p-4 text-left border-b transition-colors hover:bg-muted/50',
                selectedId === conv.id && 'bg-muted',
              )}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-sm truncate',
                      conv.unreadCount > 0 ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {displayName}
                  </span>
                  {time && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {time}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    className={cn(
                      'text-xs truncate',
                      conv.unreadCount > 0
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {conv.lastMessagePreview || 'Sem mensagens ainda'}
                  </p>
                  {conv.unreadCount > 0 && (
                    <Badge
                      variant="default"
                      className="flex-shrink-0 h-5 min-w-[20px] flex items-center justify-center text-[10px] rounded-full"
                    >
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}
