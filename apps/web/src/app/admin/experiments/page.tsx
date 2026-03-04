'use client';

import { useEffect, useState } from 'react';
import {
  FlaskConical,
  Play,
  Square,
  Trophy,
  BarChart3,
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
import { api } from '@/lib/api';

interface Experiment {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  variants: ExperimentVariant[];
}

interface ExperimentVariant {
  id: string;
  name: string;
  weight: number;
  config: Record<string, unknown>;
}

interface VariantResult {
  variantId: string;
  variantName: string;
  sampleSize: number;
  avgLatency: number | null;
  avgCost: number | null;
  avgQualityScore: number | null;
  avgUserRating: number | null;
  isWinner: boolean;
}

interface ExperimentResults {
  experimentId: string;
  status: string;
  variants: VariantResult[];
  winner: VariantResult | null;
}

const STATUS_BADGES: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  running: 'default',
  completed: 'secondary',
  archived: 'destructive',
};

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedResults, setSelectedResults] = useState<ExperimentResults | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  async function loadResults(experimentId: string) {
    if (!token) return;
    setSelectedId(experimentId);
    try {
      const result = await api<{ data: ExperimentResults }>(
        `/experiments/${experimentId}/results`,
        { token },
      );
      setSelectedResults(result.data);
    } catch {
      setSelectedResults(null);
    }
  }

  async function startExperiment(id: string) {
    if (!token) return;
    try {
      await api(`/experiments/${id}/start`, { token, method: 'POST' });
      setExperiments((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'running' } : e)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar');
    }
  }

  async function endExperiment(id: string) {
    if (!token) return;
    try {
      await api(`/experiments/${id}/end`, { token, method: 'POST' });
      setExperiments((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'completed' } : e)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar');
    }
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<{ data: Experiment[] }>('/experiments', { token })
      .then((res) => setExperiments(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Experimentos A/B</h1>
        <p className="text-muted-foreground">
          Teste de modelos e prompts de IA com metricas de qualidade, custo e latencia
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Experiment List */}
      <div className="space-y-4">
        {experiments.map((exp) => (
          <Card key={exp.id} className={selectedId === exp.id ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConical className="h-4 w-4" />
                  {exp.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_BADGES[exp.status] ?? 'outline'}>
                    {exp.status}
                  </Badge>
                  {exp.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => startExperiment(exp.id)}>
                      <Play className="mr-1 h-3 w-3" />
                      Iniciar
                    </Button>
                  )}
                  {exp.status === 'running' && (
                    <Button size="sm" variant="outline" onClick={() => endExperiment(exp.id)}>
                      <Square className="mr-1 h-3 w-3" />
                      Encerrar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => loadResults(exp.id)}>
                    <BarChart3 className="mr-1 h-3 w-3" />
                    Resultados
                  </Button>
                </div>
              </div>
              {exp.description && (
                <CardDescription className="text-xs">{exp.description}</CardDescription>
              )}
            </CardHeader>

            <CardContent>
              {/* Variants */}
              <div className="flex flex-wrap gap-2">
                {exp.variants?.map((v) => (
                  <div key={v.id} className="rounded-md border px-3 py-1.5 text-sm">
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-2 text-muted-foreground">({v.weight}%)</span>
                  </div>
                ))}
              </div>

              {/* Results */}
              {selectedId === exp.id && selectedResults && (
                <div className="mt-4 rounded-md border p-4">
                  <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Resultados
                  </h3>
                  <div className="space-y-2">
                    {selectedResults.variants.map((v) => (
                      <div
                        key={v.variantId}
                        className={`flex items-center justify-between rounded-md p-3 text-sm ${
                          v.isWinner ? 'bg-green-50 border border-green-200' : 'bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {v.isWinner && <Trophy className="h-4 w-4 text-green-600" />}
                          <span className="font-medium">{v.variantName}</span>
                          <span className="text-muted-foreground">({v.sampleSize} amostras)</span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          {v.avgLatency != null && (
                            <span>Latencia: {v.avgLatency.toFixed(0)}ms</span>
                          )}
                          {v.avgCost != null && (
                            <span>Custo: ${v.avgCost.toFixed(4)}</span>
                          )}
                          {v.avgQualityScore != null && (
                            <span>Qualidade: {v.avgQualityScore.toFixed(2)}</span>
                          )}
                          {v.avgUserRating != null && (
                            <span>Rating: {v.avgUserRating.toFixed(1)}/5</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedResults.winner && (
                    <p className="mt-2 text-sm text-green-600 font-medium">
                      Vencedor: {selectedResults.winner.variantName}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {experiments.length === 0 && !loading && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum experimento criado. Use a API POST /experiments para criar.
          </p>
        )}
      </div>
    </div>
  );
}
