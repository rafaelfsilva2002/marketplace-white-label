'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  Plus,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
  config: Record<string, unknown>;
  createdAt: string;
}

interface ActionStats {
  totalActions: number;
  pendingActions: number;
  approvedActions: number;
  rejectedActions: number;
  executedActions: number;
  approvalRate: number;
}

interface PendingAction {
  id: string;
  agentId: string;
  actionType: string;
  params: Record<string, unknown>;
  status: string;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  moderator: 'bg-orange-100 text-orange-700',
  assistant: 'bg-blue-100 text-blue-700',
  analyst: 'bg-purple-100 text-purple-700',
  pricing: 'bg-green-100 text-green-700',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<ActionStats | null>(null);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [chatAgentId, setChatAgentId] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  useEffect(() => {
    if (!token) return;

    async function fetchData() {
      try {
        const [agentsRes, statsRes, actionsRes] = await Promise.all([
          api<{ data: Agent[] }>('/agents', { token: token! }),
          api<{ data: ActionStats }>('/agents/actions/stats', { token: token! }),
          api<{ data: PendingAction[] }>('/agents/actions/pending', { token: token! }),
        ]);
        setAgents(agentsRes.data);
        setStats(statsRes.data);
        setPendingActions(actionsRes.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [token]);

  async function handleChat(agentId: string) {
    if (!token || !chatMessage.trim()) return;
    setChatLoading(true);
    setChatResponse(null);
    try {
      const result = await api<{ data: { message: { content: string } } }>(
        `/agents/${agentId}/chat`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({ message: chatMessage }),
        },
      );
      setChatResponse(result.data.message.content);
      setChatMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem');
    } finally {
      setChatLoading(false);
    }
  }

  async function handleApprove(actionId: string) {
    if (!token) return;
    try {
      await api(`/agents/actions/${actionId}/approve`, { token, method: 'POST' });
      setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar');
    }
  }

  async function handleReject(actionId: string) {
    if (!token) return;
    try {
      await api(`/agents/actions/${actionId}/reject`, {
        token,
        method: 'POST',
        body: JSON.stringify({ reason: 'Rejeitado pelo admin' }),
      });
      setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agentes IA</h1>
        <p className="text-muted-foreground">
          Gerenciamento de agentes com estado persistido e delegacao de decisao
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Action Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Acoes</p>
              <p className="text-2xl font-bold">{stats.totalActions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-bold text-orange-500">{stats.pendingActions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Aprovadas</p>
              <p className="text-2xl font-bold text-green-500">{stats.approvedActions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Rejeitadas</p>
              <p className="text-2xl font-bold text-red-500">{stats.rejectedActions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Taxa Aprovacao</p>
              <p className="text-2xl font-bold">{(stats.approvalRate * 100).toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Agent List */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Agentes Registrados</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="h-20 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))
            : agents.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Bot className="h-4 w-4" />
                        {agent.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[agent.type] ?? 'bg-gray-100 text-gray-700'}`}>
                          {agent.type}
                        </span>
                        <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                          {agent.status}
                        </Badge>
                      </div>
                    </div>
                    {agent.description && (
                      <CardDescription className="text-xs">{agent.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setChatAgentId(chatAgentId === agent.id ? null : agent.id)}
                    >
                      <MessageSquare className="mr-2 h-3 w-3" />
                      {chatAgentId === agent.id ? 'Fechar Chat' : 'Abrir Chat'}
                    </Button>

                    {chatAgentId === agent.id && (
                      <div className="space-y-2 rounded-md border p-3">
                        {chatResponse && (
                          <div className="rounded-md bg-muted p-2 text-sm">
                            {chatResponse}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Mensagem para o agente..."
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleChat(agent.id)}
                            disabled={chatLoading}
                          />
                          <Button
                            size="sm"
                            disabled={chatLoading || !chatMessage.trim()}
                            onClick={() => handleChat(agent.id)}
                          >
                            Enviar
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
        </div>
      </div>

      {/* Pending Actions */}
      {pendingActions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Acoes Pendentes de Aprovacao
          </h2>
          <div className="space-y-2">
            {pendingActions.map((action) => (
              <Card key={action.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{action.actionType}</p>
                    <p className="text-xs text-muted-foreground">
                      Agent: {action.agentId.slice(0, 8)}... | {new Date(action.createdAt).toLocaleString('pt-BR')}
                    </p>
                    <pre className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                      {JSON.stringify(action.params)}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleApprove(action.id)}>
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(action.id)}>
                      Rejeitar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
