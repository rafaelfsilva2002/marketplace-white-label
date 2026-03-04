'use client';

import { useState, useEffect } from 'react';
import { Shield, Users, AlertTriangle, CheckCircle, XCircle, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ModerationItem {
  id: string;
  type: string;
  status: string;
  targetId: string;
  content?: string;
  autoScore?: number;
  createdAt: string;
}

interface PendingAction {
  id: string;
  actionType: string;
  params: Record<string, unknown>;
  status: string;
  createdAt: string;
}

export default function AdminPage() {
  const [moderationQueue, setModerationQueue] = useState<ModerationItem[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      try {
        const [modRes, actionsRes] = await Promise.allSettled([
          fetch(`${API_URL}/moderation/queue`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/agents/actions/pending`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (modRes.status === 'fulfilled' && modRes.value.ok) {
          setModerationQueue(await modRes.value.json());
        }
        if (actionsRes.status === 'fulfilled' && actionsRes.value.ok) {
          setPendingActions(await actionsRes.value.json());
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  async function handleModeration(id: string, action: 'approve' | 'reject') {
    const token = localStorage.getItem('accessToken');
    await fetch(`${API_URL}/moderation/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    });
    setModerationQueue((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    const token = localStorage.getItem('accessToken');
    await fetch(`${API_URL}/agents/actions/${id}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    setPendingActions((prev) => prev.filter((item) => item.id !== id));
  }

  // Mock data for display
  const mockModerationQueue: ModerationItem[] = moderationQueue.length > 0 ? moderationQueue : [
    { id: '1', type: 'photo', status: 'pending', targetId: 'p1', autoScore: 0.82, createdAt: '2024-12-15' },
    { id: '2', type: 'review', status: 'pending', targetId: 'r1', content: 'Review text...', autoScore: 0.65, createdAt: '2024-12-14' },
  ];

  const mockPendingActions: PendingAction[] = pendingActions.length > 0 ? pendingActions : [
    { id: '1', actionType: 'deactivate_profile', params: { profileId: 'p1', reason: 'fraud' }, status: 'pending', createdAt: '2024-12-15' },
  ];

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Painel Administrativo</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <AlertTriangle className="h-10 w-10 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{mockModerationQueue.length}</p>
              <p className="text-sm text-muted-foreground">Itens para Moderacao</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <Bot className="h-10 w-10 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{mockPendingActions.length}</p>
              <p className="text-sm text-muted-foreground">Acoes Pendentes (IA)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <Users className="h-10 w-10 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">1,432</p>
              <p className="text-sm text-muted-foreground">Usuarios Ativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Moderation Queue */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Fila de Moderacao
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mockModerationQueue.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum item para moderar</p>
          ) : (
            <div className="space-y-4">
              {mockModerationQueue.map((item) => (
                <div key={item.id} className="flex items-center justify-between border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={item.type === 'photo' ? 'default' : 'secondary'}>
                      {item.type}
                    </Badge>
                    <div>
                      <p className="font-medium text-sm">
                        {item.type === 'photo' ? 'Foto para revisao' : 'Conteudo flaggeado'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score IA: {((item.autoScore || 0) * 100).toFixed(0)}% — {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleModeration(item.id, 'approve')}>
                      <CheckCircle className="h-4 w-4 mr-1 text-green-500" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleModeration(item.id, 'reject')}>
                      <XCircle className="h-4 w-4 mr-1 text-red-500" /> Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Agent Pending Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Acoes Pendentes dos Agentes IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mockPendingActions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma acao pendente</p>
          ) : (
            <div className="space-y-4">
              {mockPendingActions.map((action) => (
                <div key={action.id} className="flex items-center justify-between border rounded-lg p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">{action.actionType.replace('_', ' ')}</Badge>
                      <Badge variant="outline">Aguardando Aprovacao</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {JSON.stringify(action.params)} — {new Date(action.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAction(action.id, 'approve')}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleAction(action.id, 'reject')}>
                      <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
