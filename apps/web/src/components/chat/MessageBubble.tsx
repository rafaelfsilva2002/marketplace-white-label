'use client';

import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  content: string;
  type: 'text' | 'image' | 'system';
  isOwn: boolean;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
}

export function MessageBubble({
  content,
  type,
  isOwn,
  isRead,
  createdAt,
  senderName,
}: MessageBubbleProps) {
  if (type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {content}
        </span>
      </div>
    );
  }

  const time = new Date(createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn('flex mb-3', isOwn ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2',
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md',
        )}
      >
        {!isOwn && senderName && (
          <p className="text-xs font-semibold mb-1 opacity-70">{senderName}</p>
        )}
        {type === 'image' ? (
          <img
            src={content}
            alt="Imagem"
            className="rounded-lg max-w-full max-h-64 object-cover"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        )}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isOwn ? 'justify-end' : 'justify-start',
          )}
        >
          <span className="text-[10px] opacity-60">{time}</span>
          {isOwn && (
            <span className="text-[10px] opacity-60">
              {isRead ? '  Lido' : '  Enviado'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
