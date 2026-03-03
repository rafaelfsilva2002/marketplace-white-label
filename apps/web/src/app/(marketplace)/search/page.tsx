'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProfileCard } from '@/components/profiles/profile-card';

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
      // TODO: Replace with actual API call
      // const endpoint = searchMode === 'semantic' ? '/search/semantic' : '/search';
      // const data = await api(endpoint, { method: 'POST', body: JSON.stringify({ query: searchQuery }) });

      // Mock results for now
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
          bio: 'Especialista em cortes asiáticos e coreanos',
          city: 'Sao Paulo',
          state: 'SP',
          services: ['Corte coreano', 'Coloracao', 'Tratamento capilar'],
          isVerified: true,
          averageRating: 4.9,
          reviewCount: 73,
        },
      ]);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Busque profissionais..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </Button>
        <Button type="button" variant="outline" size="lg">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex rounded-lg border p-1">
          <button
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              searchMode === 'semantic'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSearchMode('semantic')}
          >
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
            {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((profile) => (
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
