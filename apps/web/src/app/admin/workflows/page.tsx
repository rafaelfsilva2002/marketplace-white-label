'use client';

import { useEffect, useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, getAccessToken } from '@/lib/api';

interface Workflow {
  id: string;
  name: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  correlationId: string;
  createdAt: string;
}

interface WorkflowStep {
  id: string;
  stepName: string;
  status: string;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
}

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  running: { variant: 'default', icon: Loader2 },
  completed: { variant: 'secondary', icon: CheckCircle2 },
  failed: { variant: 'destructive', icon: XCircle },
  pending: { variant: 'outline', icon: Clock },
};

const AVAILABLE_WORKFLOWS = ['professional-onboarding', 'content-moderation'];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function startWorkflow(name: string) {
    if (!getAccessToken()) return;
    setStarting(true);
    setError('');
    try {
      const result = await api<{ data: Workflow }>(`/workflows/${name}/start`, {
        method: 'POST',
        body: JSON.stringify({ input: {} }),
      });
      setWorkflows((prev) => [result.data, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar workflow');
    } finally {
      setStarting(false);
    }
  }

  async function loadSteps(workflowId: string) {
    if (!getAccessToken()) return;
    setSelectedWorkflow(workflowId);
    try {
      const result = await api<{ data: WorkflowStep[] }>(`/workflows/${workflowId}/steps`);
      setSteps(result.data);
    } catch {
      setSteps([]);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) return;
    setLoading(true);
    api<{ data: Workflow[] }>('/workflows')
      .then((res) => setWorkflows(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
        <p className="text-muted-foreground">
          Orquestracao de workflows longos com retries e timeouts
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Start workflow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Iniciar Workflow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {AVAILABLE_WORKFLOWS.map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              disabled={starting}
              onClick={() => startWorkflow(name)}
            >
              <Play className="mr-2 h-3 w-3" />
              {name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Workflow list */}
      <div className="space-y-3">
        {workflows.map((wf) => {
          const badge = STATUS_BADGES[wf.status] ?? STATUS_BADGES.pending;
          const Icon = badge.icon;
          const isSelected = selectedWorkflow === wf.id;

          return (
            <Card
              key={wf.id}
              className={isSelected ? 'ring-2 ring-primary' : 'cursor-pointer hover:bg-accent/50'}
              onClick={() => loadSteps(wf.id)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{wf.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {wf.id.slice(0, 8)}... | {new Date(wf.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Badge variant={badge.variant} className="flex items-center gap-1">
                  <Icon className={`h-3 w-3 ${wf.status === 'running' ? 'animate-spin' : ''}`} />
                  {wf.status}
                </Badge>
              </CardContent>

              {isSelected && steps.length > 0 && (
                <div className="border-t px-4 pb-4">
                  <p className="mb-2 pt-3 text-sm font-medium">Steps:</p>
                  <div className="space-y-1">
                    {steps.map((step) => {
                      const sBadge = STATUS_BADGES[step.status] ?? STATUS_BADGES.pending;
                      return (
                        <div key={step.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                          <span>{step.stepName} (attempt {step.attempt})</span>
                          <Badge variant={sBadge.variant} className="text-xs">
                            {step.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {workflows.length === 0 && !loading && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum workflow executado. Inicie um workflow acima.
          </p>
        )}
      </div>
    </div>
  );
}
