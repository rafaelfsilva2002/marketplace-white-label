'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConversationList } from '@/components/chat/ConversationList';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

interface ConversationItem {
  id: string;
  participantOneId: string;
  participantTwoId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  isActive: boolean;
  otherParticipant: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  unreadCount: number;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'system';
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

function getCurrentUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub;
  } catch {
    return null;
  }
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = getCurrentUserId();
  const token = getToken();

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load conversations
  useEffect(() => {
    if (!token) return;

    async function loadConversations() {
      try {
        const response = await fetch(`${API_URL}/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const result = await response.json();
          setConversations(result.data?.data || []);
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        setLoadingConversations(false);
      }
    }

    loadConversations();
  }, [token]);

  // Setup Socket.IO connection
  useEffect(() => {
    if (!token) return;

    const newSocket = io(`${WS_URL}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Chat socket connected');
    });

    newSocket.on('new_message', (message: MessageItem) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    newSocket.on('message_notification', (data: { conversationId: string; message: MessageItem }) => {
      // Update conversation list with new message preview
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === data.conversationId
            ? {
                ...conv,
                lastMessageAt: data.message.createdAt,
                lastMessagePreview:
                  data.message.content.length > 200
                    ? data.message.content.substring(0, 197) + '...'
                    : data.message.content,
                unreadCount: conv.unreadCount + 1,
              }
            : conv,
        ),
      );
    });

    newSocket.on('user_typing', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.isTyping) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
      } else {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }
    });

    newSocket.on('messages_read', (data: { conversationId: string; readBy: string }) => {
      if (data.readBy !== currentUserId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.conversationId === data.conversationId && msg.senderId === currentUserId
              ? { ...msg, isRead: true, readAt: new Date().toISOString() }
              : msg,
          ),
        );
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Chat socket disconnected');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, currentUserId]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConversationId || !token) return;

    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const response = await fetch(
          `${API_URL}/chat/conversations/${selectedConversationId}/messages?limit=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.ok) {
          const result = await response.json();
          setMessages(result.data?.data || []);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    }

    loadMessages();

    // Join conversation room via WebSocket
    if (socket?.connected) {
      socket.emit('join_conversation', { conversationId: selectedConversationId });
    }
  }, [selectedConversationId, token, socket]);

  // Mark as read when viewing conversation
  useEffect(() => {
    if (!selectedConversationId || !token || !socket?.connected) return;

    const conv = conversations.find((c) => c.id === selectedConversationId);
    if (conv && conv.unreadCount > 0) {
      socket.emit('mark_read', { conversationId: selectedConversationId });

      // Update local state
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversationId ? { ...c, unreadCount: 0 } : c,
        ),
      );
    }
  }, [selectedConversationId, token, socket, conversations]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!socket?.connected || !selectedConversationId) return;

      socket.emit('send_message', {
        conversationId: selectedConversationId,
        content,
        type: 'text',
      });

      // Optimistically update conversation list
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedConversationId
            ? {
                ...conv,
                lastMessageAt: new Date().toISOString(),
                lastMessagePreview:
                  content.length > 200
                    ? content.substring(0, 197) + '...'
                    : content,
              }
            : conv,
        ),
      );
    },
    [socket, selectedConversationId],
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket?.connected || !selectedConversationId) return;
      socket.emit('typing', { conversationId: selectedConversationId, isTyping });
    },
    [socket, selectedConversationId],
  );

  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId,
  );

  if (!token) {
    return (
      <main className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Chat</h1>
        <p className="text-muted-foreground mb-4">
          Voce precisa estar logado para acessar o chat.
        </p>
        <Button asChild>
          <a href="/login">Entrar</a>
        </Button>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-4">Mensagens</h1>

      <div className="flex border rounded-lg overflow-hidden bg-background" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Conversation List Sidebar */}
        <div className="w-80 border-r flex-shrink-0 flex flex-col">
          <div className="p-3 border-b">
            <h2 className="text-sm font-semibold text-muted-foreground">Conversas</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <ConversationList
              conversations={conversations}
              selectedId={selectedConversationId}
              onSelect={setSelectedConversationId}
              loading={loadingConversations}
            />
          </div>
        </div>

        {/* Message Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedConversationId && selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="p-4 border-b flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">
                    {(
                      selectedConversation.otherParticipant?.name ||
                      selectedConversation.otherParticipant?.email ||
                      'U'
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    {selectedConversation.otherParticipant?.name ||
                      selectedConversation.otherParticipant?.email ||
                      'Usuario'}
                  </h3>
                  {typingUsers.size > 0 && (
                    <p className="text-xs text-muted-foreground">digitando...</p>
                  )}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">
                      Nenhuma mensagem ainda. Envie a primeira!
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        content={msg.content}
                        type={msg.type}
                        isOwn={msg.senderId === currentUserId}
                        isRead={msg.isRead}
                        createdAt={msg.createdAt}
                        senderName={
                          msg.senderId !== currentUserId
                            ? selectedConversation.otherParticipant?.name || undefined
                            : undefined
                        }
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <ChatInput
                onSendMessage={handleSendMessage}
                onTyping={handleTyping}
                disabled={!socket?.connected}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-lg text-muted-foreground">
                  Selecione uma conversa para comecar
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Escolha uma conversa na lista ao lado
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
