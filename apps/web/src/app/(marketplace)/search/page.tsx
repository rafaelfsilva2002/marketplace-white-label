'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, Sparkles, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProfileCard } from '@/components/profiles/profile-card';
import { api, extractApiData } from '@/lib/api';

interface Profile {
  id: string;
  displayName: string;
  bio?: string;
  city?: string;
  state?: string;
  services?: string[];
  photos?: string[];
  isVerified?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

interface SemanticSearchResponse {
  results: Profile[];
  meta?: {
    query: string;
    mode: 'semantic';
    count: number;
  };
}

interface TextSearchRow {
  profile: Profile;
  rank: number;
}

interface TextSearchResponse {
  data: TextSearchRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SearchMode = 'text' | 'semantic';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialLocation = searchParams.get('location') || '';

  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [results, setResults] = useState<Profile[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic');

  useEffect(() => {
    setQuery(initialQuery);
    setLocation(initialLocation);

    if (initialQuery.trim()) {
      void performSearch(initialQuery, searchMode, initialLocation);
    }
    // We intentionally react to URL changes; search mode state is user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, initialLocation]);

  async function performTextSearch(
    searchQuery: string,
    searchLocation: string,
  ): Promise<{ profiles: Profile[]; total: number }> {
    const params = new URLSearchParams();
    params.set('q', searchQuery);
    if (searchLocation.trim()) {
      params.set('city', searchLocation.trim());
    }

    const raw = await api<TextSearchResponse | { success: boolean; data: TextSearchResponse }>(
      `/search?${params.toString()}`,
    );
    const data = extractApiData<TextSearchResponse>(raw);

    return {
      profiles: data.data.map((item) => item.profile),
      total: data.total,
    };
  }

  async function performSemanticSearch(
    searchQuery: string,
    searchLocation: string,
  ): Promise<{ profiles: Profile[]; total: number }> {
    const raw = await api<
      SemanticSearchResponse | { success: boolean; data: SemanticSearchResponse }
    >('/search/semantic', {
      method: 'POST',
      body: JSON.stringify({
        query: searchQuery,
        city: searchLocation.trim() || undefined,
      }),
    });

    const data = extractApiData<SemanticSearchResponse>(raw);
    return {
      profiles: data.results,
      total: data.meta?.count ?? data.results.length,
    };
  }

  async function performSearch(
    searchQuery: string,
    mode: SearchMode,
    searchLocation: string,
  ) {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');

    try {
      const result =
        mode === 'semantic'
          ? await performSemanticSearch(searchQuery, searchLocation)
          : await performTextSearch(searchQuery, searchLocation);

      setResults(result.profiles);
      setTotalResults(result.total);
    } catch (semanticError) {
      if (mode === 'semantic') {
        try {
          const fallback = await performTextSearch(searchQuery, searchLocation);
          setResults(fallback.profiles);
          setTotalResults(fallback.total);
          setError(
            'Busca IA indisponivel no momento. Exibindo resultados da busca textual.',
          );
        } catch (textError) {
          const message =
            textError instanceof Error
              ? textError.message
              : 'Nao foi possivel buscar resultados.';
          setError(message);
          setResults([]);
          setTotalResults(0);
        }
      } else {
        const message =
          semanticError instanceof Error
            ? semanticError.message
            : 'Nao foi possivel buscar resultados.';
        setError(message);
        setResults([]);
        setTotalResults(0);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void performSearch(query, searchMode, location);
  }

  return (
    <main className="px-4 py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <form onSubmit={handleSearch} className="rounded-2xl border bg-card p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              {searchMode === 'semantic' ? (
                <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              ) : (
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <Input
                type="text"
                placeholder={
                  searchMode === 'semantic'
                    ? "Descreva o que voce precisa... Ex: 'corte feminino com coloracao em Sao Paulo'"
                    : 'Busque profissionais...'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-12 pl-10"
              />
            </div>

            <div className="relative lg:w-64">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Cidade (opcional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-12 pl-10"
              />
            </div>

            <Button type="submit" size="lg" disabled={loading} className="h-12 px-6">
              {loading ? 'Buscando...' : searchMode === 'semantic' ? 'Buscar IA' : 'Buscar'}
            </Button>

            <Button type="button" variant="outline" size="lg" className="h-12 w-12 px-0">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border p-1">
              <button
                type="button"
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm transition-colors ${
                  searchMode === 'semantic'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setSearchMode('semantic')}
              >
                <Sparkles className="h-3 w-3" />
                Busca IA
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  searchMode === 'text'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setSearchMode('text')}
              >
                Texto
              </button>
            </div>

            {totalResults > 0 && (
              <span className="text-sm text-muted-foreground">
                {totalResults} resultado{totalResults !== 1 ? 's' : ''} encontrado
                {totalResults !== 1 ? 's' : ''}
                {searchMode === 'semantic' && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    via IA
                  </Badge>
                )}
              </span>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <div className="mt-8 grid min-h-[1px] grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>

        {results.length === 0 && !loading && query.trim() && !error && (
          <div className="mt-16 text-center">
            <p className="text-lg text-muted-foreground">
              Nenhum resultado encontrado para &quot;{query}&quot;
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Tente outra descricao ou ajuste a cidade.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
