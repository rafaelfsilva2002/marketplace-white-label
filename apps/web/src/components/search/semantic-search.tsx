'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from '@/hooks/use-debounce';
import Link from 'next/link';

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
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/search/semantic`,
          {
            method: 'POST',
            body: JSON.stringify({ query: debouncedQuery }),
            headers: { 'Content-Type': 'application/json' },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
          setShowDropdown(true);
        }
      } catch {
        console.error('Semantic search failed');
      } finally {
        setLoading(false);
      }
    }

    search();
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
          <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-500" />
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
        <div className="absolute top-full left-0 right-0 z-50 mt-2 p-4 bg-background rounded-lg border shadow-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            <span className="text-sm text-muted-foreground">Buscando com IA...</span>
          </div>
        </div>
      )}

      {!loading && showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-background rounded-lg border shadow-lg max-h-96 overflow-y-auto">
          <div className="p-2 border-b">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-purple-500" />
              {results.length} resultado{results.length !== 1 ? 's' : ''} por busca semantica
            </span>
          </div>
          {results.map((profile) => (
            <Link
              key={profile.id}
              href={`/profiles/${profile.id}`}
              onClick={() => setShowDropdown(false)}
              className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-0"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground/50">
                {profile.displayName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{profile.displayName}</span>
                  {profile.similarity && (
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(profile.similarity * 100)}% match
                    </Badge>
                  )}
                </div>
                {profile.bio && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{profile.bio}</p>
                )}
                {profile.services && profile.services.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {profile.services.slice(0, 3).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] px-1 py-0">
                        {s}
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
