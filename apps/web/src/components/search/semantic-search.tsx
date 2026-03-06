'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from '@/hooks/use-debounce';
import { api, extractApiData } from '@/lib/api';

interface SemanticResult {
  id: string;
  displayName: string;
  bio?: string;
  city?: string;
  state?: string;
  services?: string[];
  averageRating?: number;
  similarity?: number;
}

interface SemanticSearchResponse {
  results: Omit<SemanticResult, 'similarity'>[];
  meta?: {
    query: string;
    mode: 'semantic';
    count: number;
    similarities?: number[];
  };
}

export function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SemanticResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debouncedQuery = useDebounce(query, 500);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    async function search() {
      setLoading(true);
      try {
        const raw = await api<
          SemanticSearchResponse | { success: boolean; data: SemanticSearchResponse }
        >('/search/semantic', {
          method: 'POST',
          body: JSON.stringify({ query: debouncedQuery }),
          noAuth: true,
        });

        const data = extractApiData<SemanticSearchResponse>(raw);
        const normalized: SemanticResult[] = data.results.map((profile, index) => ({
          ...profile,
          similarity: data.meta?.similarities?.[index],
        }));
        setResults(normalized);
        setShowDropdown(true);
      } catch {
        setResults([]);
        setShowDropdown(false);
      } finally {
        setLoading(false);
      }
    }

    void search();
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            type="text"
            placeholder="Busque em linguagem natural... ex: 'quero alguem pra cortar cabelo estilo coreano'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            className="pl-10 h-12"
          />
        </div>
        <Button type="button" size="lg" disabled={loading}>
          <Search className="w-4 h-4 mr-2" />
          {loading ? 'Buscando...' : 'Buscar IA'}
        </Button>
      </div>

      {loading && showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-lg border bg-background p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary" />
            <span className="text-sm text-muted-foreground">Buscando com IA...</span>
          </div>
        </div>
      )}

      {!loading && showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border bg-background shadow-lg">
          <div className="border-b p-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              {results.length} resultado{results.length !== 1 ? 's' : ''} por busca semantica
            </span>
          </div>
          {results.map((profile) => (
            <Link
              key={profile.id}
              href={`/profiles/${profile.id}`}
              onClick={() => setShowDropdown(false)}
              className="flex items-start gap-3 border-b p-3 transition-colors hover:bg-muted/50 last:border-0"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground/50">
                {profile.displayName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{profile.displayName}</span>
                  {profile.similarity && (
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(profile.similarity * 100)}% match
                    </Badge>
                  )}
                </div>
                {profile.bio && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{profile.bio}</p>
                )}
                {profile.services && profile.services.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {profile.services.slice(0, 3).map((service) => (
                      <Badge key={service} variant="outline" className="px-1 py-0 text-[10px]">
                        {service}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {profile.averageRating && (
                <span className="text-xs font-medium text-yellow-600">
                  {profile.averageRating.toFixed(1)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
