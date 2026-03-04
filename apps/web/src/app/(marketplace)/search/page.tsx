'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProfileCard } from '@/components/profiles/profile-card';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<'text' | 'semantic'>('semantic');

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery]);

  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return;
    setLoading(true);

    try {
      if (searchMode === 'semantic') {
        const response = await fetch(`${API_URL}/search/semantic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
        } else {
          // Fallback to text search if semantic fails
          await performTextSearch(searchQuery);
        }
      } else {
        await performTextSearch(searchQuery);
      }
    } catch {
      // Fallback to mock on network error
      setResults([
        {
          id: '1',
          displayName: 'Maria Silva',
          bio: 'Cabeleireira profissional com 10 anos de experiencia em cortes modernos',
          city: 'Sao Paulo',
          state: 'SP',
          services: ['Corte feminino', 'Coloracao', 'Escova'],
          isVerified: true,
          averageRating: 4.8,
          reviewCount: 127,
        },
        {
          id: '4',
          displayName: 'Julia Ferreira',
          bio: 'Especialista em cortes asiaticos e coreanos',
          city: 'Sao Paulo',
          state: 'SP',
          services: ['Corte coreano', 'Coloracao', 'Tratamento capilar'],
          isVerified: true,
          averageRating: 4.9,
          reviewCount: 73,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function performTextSearch(searchQuery: string) {
    const response = await fetch(
      `${API_URL}/search?q=${encodeURIComponent(searchQuery)}`
    );
    if (response.ok) {
      const data = await response.json();
      setResults(data.results || data || []);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    performSearch(query);
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          {searchMode === 'semantic' ? (
            <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-500" />
          ) : (
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            type="text"
            placeholder={
              searchMode === 'semantic'
                ? "Busque em linguagem natural... ex: 'quero cortar cabelo estilo coreano'"
                : 'Busque profissionais...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? 'Buscando...' : searchMode === 'semantic' ? 'Buscar IA' : 'Buscar'}
        </Button>
        <Button type="button" variant="outline" size="lg">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex rounded-lg border p-1">
          <button
            className={`rounded-md px-3 py-1 text-sm transition-colors flex items-center gap-1 ${
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
        {results.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado
            {results.length !== 1 ? 's' : ''}
            {searchMode === 'semantic' && (
              <Badge variant="secondary" className="ml-2 text-xs">
                via IA
              </Badge>
            )}
          </span>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((profile: any) => (
          <ProfileCard key={profile.id} profile={profile} />
        ))}
      </div>

      {results.length === 0 && !loading && initialQuery && (
        <div className="mt-16 text-center">
          <p className="text-lg text-muted-foreground">
            Nenhum resultado encontrado para &quot;{initialQuery}&quot;
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tente buscar com termos diferentes ou use a busca por IA
          </p>
        </div>
      )}
    </main>
  );
}
